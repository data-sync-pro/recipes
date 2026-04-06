import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  HostListener
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { Subject, combineLatest, fromEvent, firstValueFrom } from 'rxjs';
import { takeUntil, throttleTime } from 'rxjs/operators';
import JSZip from 'jszip';

import { Recipe, Category } from '../../core/models/recipe.model';
import { CacheService } from '../../core/services/cache.service';
import { SearchService } from '../../core/services/search.service';
import { BreadcrumbItem } from '../detail-banner/detail-banner.component';

interface CategoryGroup {
  category: Category;
  recipes: Recipe[];
  isExpanded: boolean;
}

interface TocItem {
  id: string;
  label: string;
  children?: TocItem[];
}

@Component({
  selector: 'app-recipe-detail-page',
  templateUrl: './detail-page.component.html',
  styleUrls: ['./detail-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipeDetailPageComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  currentRecipe: Recipe | null = null;
  breadcrumbs: BreadcrumbItem[] = [];

  // Sidebar category groups
  categoryGroups: CategoryGroup[] = [];
  filteredCategoryGroups: CategoryGroup[] = [];
  sidebarSearchQuery: string = '';
  allRecipes: Recipe[] = [];
  allCategories: Category[] = [];

  // Active TOC section
  activeTocSection: string = 'overview';
  private isScrollingToSection: boolean = false;
  tocItems: TocItem[] = [];

  // Media preview modal
  isMediaModalOpen: boolean = false;
  previewMedia: { type: string; url: string; alt: string } | null = null;

  // Search overlay
  isSearchOverlayOpen: boolean = false;

  // YouTube URL cache to prevent flickering on scroll
  private youtubeUrlCache = new Map<string, SafeResourceUrl>();

  // Cached YouTube videos from generalImages to prevent re-rendering on scroll
  private cachedYouTubeVideos: { url: string; alt: string }[] = [];

  @ViewChild('sidebarSearchInput') sidebarSearchInput!: ElementRef<HTMLInputElement>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private cacheService: CacheService,
    private searchService: SearchService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    // Get route params and load recipe
    combineLatest([
      this.route.paramMap,
      this.cacheService.getRecipes$()
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([params, recipes]) => {
      const category = params.get('category');
      const recipeName = params.get('recipeName');

      this.allRecipes = recipes;
      this.allCategories = this.searchService.generateCategories(recipes);

      // Build category groups
      this.buildCategoryGroups();

      if (category && recipeName) {
        // Find the recipe by category and slug
        const recipe = recipes.find(r =>
          r.category.includes(category) && r.slug === recipeName
        );

        if (recipe) {
          this.currentRecipe = recipe;

          // Build breadcrumb path (use first category or matched category)
          const breadcrumbCategory = recipe.category.includes(category) ? category : recipe.category[0];
          this.breadcrumbs = [
            { name: 'Recipes', url: '/recipes' },
            { name: breadcrumbCategory, url: `/recipes/${breadcrumbCategory}` }
          ];

          // Expand the current category
          this.expandCategory(breadcrumbCategory);

          // Cache YouTube videos first (before building TOC which depends on it)
          this.buildYouTubeVideosCache();

          // Build TOC items dynamically
          this.buildTocItems();

          this.cdr.markForCheck();

          // Setup scroll listener for TOC after a short delay to ensure DOM is ready
          setTimeout(() => this.setupScrollListener(), 100);
        } else {
          // Recipe not found, redirect to recipes list
          this.router.navigate(['/recipes']);
        }
      }
    });
  }

  private buildCategoryGroups(): void {
    this.categoryGroups = this.allCategories.map(category => ({
      category,
      recipes: this.allRecipes.filter(r => r.category.includes(category.name)),
      isExpanded: false
    }));
    this.filteredCategoryGroups = [...this.categoryGroups];
  }

  private expandCategory(categoryName: string): void {
    const group = this.categoryGroups.find(g => g.category.name === categoryName);
    if (group) {
      group.isExpanded = true;
    }
  }

  toggleCategory(categoryName: string): void {
    const group = this.filteredCategoryGroups.find(g => g.category.name === categoryName);
    if (group) {
      group.isExpanded = !group.isExpanded;
      this.cdr.markForCheck();
    }
  }

  onSidebarSearchInput(): void {
    const query = this.sidebarSearchQuery.toLowerCase().trim();

    if (!query) {
      this.filteredCategoryGroups = [...this.categoryGroups];
    } else {
      // Filter recipes and expand categories with matching recipes
      this.filteredCategoryGroups = this.categoryGroups.map(group => {
        const filteredRecipes = group.recipes.filter(recipe =>
          recipe.title.toLowerCase().includes(query)
        );
        return {
          ...group,
          recipes: filteredRecipes,
          isExpanded: filteredRecipes.length > 0 ? true : group.isExpanded
        };
      }).filter(group => group.recipes.length > 0);
    }

    this.cdr.markForCheck();
  }

  @HostListener('document:keydown./', ['$event'])
  onSlashKey(event: Event) {
    event.preventDefault();
    this.openSearchOverlay();
  }

  openSearchOverlay(): void {
    this.isSearchOverlayOpen = true;
    this.cdr.markForCheck();
  }

  closeSearchOverlay(): void {
    this.isSearchOverlayOpen = false;
    this.cdr.markForCheck();
  }

  handleSearchSelect(selectedItem: any): void {
    this.closeSearchOverlay();
    // Navigate using the route provided by the search overlay
    if (selectedItem.slug && selectedItem.category) {
      this.router.navigate(['/recipes', selectedItem.category, selectedItem.slug]);
    }
  }

  scrollToSection(event: Event, sectionId: string): void {
    event.preventDefault();

    // Set the active section immediately
    this.activeTocSection = sectionId;
    this.cdr.markForCheck();

    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 80; // Offset for fixed header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'auto'
      });
    }
  }

  getDownloadFileName(file: any): string {
    // Extract filename from filePath, keeping underscores for safe file downloads
    const filePath = file.filePath || file.url || '';
    const fileName = filePath.split('/').pop() || 'download.json';

    // Ensure .json extension is present
    return fileName.endsWith('.json') ? fileName : fileName + '.json';
  }

  getDownloadDisplayName(file: any): string {
    // If title exists, return it
    if (file.title) {
      return file.title;
    }

    // Extract filename from filePath
    const filePath = file.filePath || file.url || '';
    const fileName = filePath.split('/').pop() || 'Download File';

    // Remove .json extension and replace underscores with spaces for display
    return fileName.replace('.json', '').replace(/_/g, ' ');
  }

  async downloadAllExecutables(): Promise<void> {
    if (!this.currentRecipe?.downloadableExecutables || this.currentRecipe.downloadableExecutables.length === 0) {
      return;
    }

    const zip = new JSZip();
    const executables = this.currentRecipe.downloadableExecutables;

    for (const file of executables) {
      const fileUrl = file.url || file.filePath;
      if (!fileUrl) continue;

      try {
        const response = await firstValueFrom(this.http.get(fileUrl, { responseType: 'blob' }));
        const fileName = this.getDownloadFileName(file);
        zip.file(fileName, response);
      } catch (error) {
        console.warn(`Failed to fetch file: ${fileUrl}`, error);
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const recipeTitle = this.currentRecipe.title.replace(/\s+/g, '_').replace(/-/g, '_');
    const zipFileName = `${recipeTitle}_Executables.zip`;

    // Trigger download
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = zipFileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  getGeneralUseCaseItems(): string[] {
    if (!this.currentRecipe?.generalUseCase) {
      return [];
    }
    // Split by \n and filter out empty strings
    return this.currentRecipe.generalUseCase
      .split('\n')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  // shouldShowRulesEngine(): boolean {
  //   if (!this.currentRecipe) {
  //     return false;
  //   }
  //   // Show Rules Engine section if category does not include 'Transformation'
  //   return !this.currentRecipe.category.some(c => c.toLowerCase() === 'transformation');
  // }

  private buildTocItems(): void {
    if (!this.currentRecipe) {
      this.tocItems = [];
      return;
    }

    const items: TocItem[] = [];

    // Overview is always shown
    items.push({ id: 'overview', label: 'Overview' });


    // Downloadable Executables
    if (this.currentRecipe.downloadableExecutables && this.currentRecipe.downloadableExecutables.length > 0) {
      items.push({ id: 'download-file', label: 'Downloadable Executables' });
    }

    // Video Demo
    if (this.cachedYouTubeVideos.length > 0) {
      items.push({ id: 'video-demo', label: 'Video Demo' });
    }

    // General Use Case
    if (this.currentRecipe.generalUseCase && this.getGeneralUseCaseItems().length > 0) {
      items.push({ id: 'use-case', label: 'General Use Case' });
    }


    // Direction
    if (this.currentRecipe.direction && this.currentRecipe.direction.trim().length > 0) {
      items.push({ id: 'direction', label: 'Direction' });
    }

    // Pipeline
    if (this.currentRecipe.pipeline && this.currentRecipe.pipeline.trim().length > 0) {
      items.push({ id: 'pipeline', label: 'Pipeline' });
    }

    // Walkthrough with sub-items
    if (this.currentRecipe.walkthrough && this.currentRecipe.walkthrough.length > 0) {
      const walkthroughChildren = this.currentRecipe.walkthrough.map((step, index) => {
        // Only show content before the hyphen
        const stepLabel = step.step.includes(' - ') ? step.step.split(' - ')[0] : step.step;
        return {
          id: `walkthrough-step-${index + 1}`,
          label: `${index + 1}. ${stepLabel}`
        };
      });
      items.push({ id: 'walkthrough', label: 'Walkthrough', children: walkthroughChildren });
    }

    // Verification (temporarily hidden - videos moved to overview)
    // if ((this.currentRecipe.verificationGIF && this.currentRecipe.verificationGIF.length > 0) || this.getYouTubeVideosFromGeneralImages().length > 0) {
    //   items.push({ id: 'verificationGIF', label: 'Verification' });
    // }



    this.tocItems = items;
  }

  private setupScrollListener(): void {
    fromEvent(window, 'scroll')
      .pipe(
        throttleTime(100),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.updateActiveTocSection();
      });

    // Initial check
    this.updateActiveTocSection();
  }

  private updateActiveTocSection(): void {
    if (!this.currentRecipe || this.isScrollingToSection) return;

    // Build sections list including walkthrough steps
    const sections = [
      'overview',
      'video-demo',
      'use-case',
      'walkthrough'
    ];

    // Add walkthrough step IDs
    if (this.currentRecipe.walkthrough) {
      this.currentRecipe.walkthrough.forEach((_, index) => {
        sections.push(`walkthrough-step-${index + 1}`);
      });
    }

    sections.push('verification-gif', 'download-file');

    // Find which section is currently most visible in the viewport
    const viewportMiddle = window.scrollY + window.innerHeight / 3;
    let activeSection = 'overview';
    let closestDistance = Infinity;

    for (const sectionId of sections) {
      const element = document.getElementById(sectionId);
      if (element) {
        const rect = element.getBoundingClientRect();
        const elementTop = window.scrollY + rect.top;
        const elementBottom = elementTop + rect.height;

        // Check if section is in viewport
        if (elementTop <= viewportMiddle && elementBottom >= window.scrollY) {
          const distance = Math.abs(elementTop - window.scrollY);
          if (distance < closestDistance) {
            closestDistance = distance;
            activeSection = sectionId;
          }
        }
      }
    }

    // If scrolled to bottom, activate the last TOC item
    const scrolledToBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 50);
    if (scrolledToBottom && this.tocItems.length > 0) {
      const lastItem = this.tocItems[this.tocItems.length - 1];
      activeSection = lastItem.children?.length
        ? lastItem.children[lastItem.children.length - 1].id
        : lastItem.id;
    }

    if (this.activeTocSection !== activeSection) {
      this.activeTocSection = activeSection;
      this.cdr.markForCheck();
    }
  }

  openMediaPreview(media: any): void {
    this.previewMedia = {
      type: media.type,
      url: media.displayUrl || media.url,
      alt: media.alt || ''
    };
    this.isMediaModalOpen = true;
    this.cdr.markForCheck();
  }

  closeMediaPreview(): void {
    this.isMediaModalOpen = false;
    this.previewMedia = null;
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isMediaModalOpen) {
      this.closeMediaPreview();
    }
  }

  isYouTubeUrl(url: string): boolean {
    return url?.includes('youtu.be') || url?.includes('youtube.com');
  }

  hasNonYouTubeGeneralImages(): boolean {
    if (!this.currentRecipe?.generalImages?.length) return false;
    return this.currentRecipe.generalImages.some(
      media => !(media.type === 'video' && this.isYouTubeUrl(media.url))
    );
  }

  getYouTubeVideosFromGeneralImages(): { url: string; alt: string }[] {
    // Return cached result to prevent iframe re-rendering on scroll
    return this.cachedYouTubeVideos;
  }

  private buildYouTubeVideosCache(): void {
    if (!this.currentRecipe?.generalImages?.length) {
      this.cachedYouTubeVideos = [];
      return;
    }
    this.cachedYouTubeVideos = this.currentRecipe.generalImages
      .filter(media => media.type === 'video' && this.isYouTubeUrl(media.url))
      .map(media => ({ url: media.url, alt: media.alt }));
  }

  getYouTubeEmbedUrl(url: string): SafeResourceUrl {
    // Return cached URL to prevent iframe flickering on scroll
    if (this.youtubeUrlCache.has(url)) {
      return this.youtubeUrlCache.get(url)!;
    }

    let videoId = '';

    if (url.includes('youtu.be/')) {
      // Format: https://youtu.be/VIDEO_ID
      videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
    } else if (url.includes('youtube.com/watch')) {
      // Format: https://www.youtube.com/watch?v=VIDEO_ID
      const urlParams = new URL(url).searchParams;
      videoId = urlParams.get('v') || '';
    } else if (url.includes('youtube.com/embed/')) {
      // Already embed format
      videoId = url.split('youtube.com/embed/')[1]?.split('?')[0] || '';
    }

    const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0`;
    const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
    this.youtubeUrlCache.set(url, safeUrl);
    return safeUrl;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
