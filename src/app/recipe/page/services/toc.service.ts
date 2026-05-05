import { Injectable } from '@angular/core';
import { Recipe, Section, Tab } from '../../core/models/recipe.model';
import { RECIPE_SECTIONS } from '../../core/constants/recipe.constants';

export interface SectionConfig {
  id: string;
  title: string;
  elementId: string;
  contentType: string;
  isVisible: () => boolean;
  getData: () => any;
  alwaysShow?: boolean;
  isHighlight?: boolean;
  tagClass?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TocService {

  private currentRecipe: Recipe | null = null;

  private cachedOverviewSections?: any[];
  private cachedRecipeId?: string;

  constructor() { }

  setCurrentRecipe(recipe: Recipe | null): void {
    if (this.currentRecipe?.id !== recipe?.id) {
      this.cachedOverviewSections = undefined;
      this.cachedRecipeId = undefined;
    }
    this.currentRecipe = recipe;
  }

  generateRecipeTabs(): Tab[] {
    if (!this.currentRecipe) {
      return [];
    }

    const tabs: Tab[] = [];

    const overviewSections = this.generateOverviewSections();
    if (overviewSections.length > 0) {
      tabs.push({
        id: RECIPE_SECTIONS.OVERVIEW,
        title: 'Overview',
        sections: overviewSections
      });
    }

    const walkthroughSections = this.generateWalkthroughSections();
    if (walkthroughSections.length > 0) {
      tabs.push({
        id: RECIPE_SECTIONS.WALKTHROUGH,
        title: 'Walkthrough',
        sections: walkthroughSections
      });
    }

    return tabs;
  }

  private getOverviewSectionConfigs(): SectionConfig[] {
    return [
      {
        id: RECIPE_SECTIONS.OVERVIEW,
        title: 'Overview',
        elementId: RECIPE_SECTIONS.RECIPE_OVERVIEW,
        contentType: 'html',
        isVisible: () => this.hasValidOverview(),
        getData: () => this.currentRecipe?.overview,
        alwaysShow: true,
        isHighlight: true
      },
      {
        id: RECIPE_SECTIONS.GENERAL_USE_CASE,
        title: 'General Use Case',
        elementId: 'recipe-general-use-case',
        contentType: 'html',
        isVisible: () => this.hasValidGeneralUseCase(),
        getData: () => this.currentRecipe?.generalUseCase
      },
      {
        id: 'dsp-versions',
        title: 'Supported DSP Versions',
        elementId: 'recipe-dsp-versions',
        contentType: 'tag-list',
        isVisible: () => !!(this.currentRecipe?.DSPVersions?.length && this.currentRecipe.DSPVersions.length > 0),
        getData: () => this.currentRecipe?.DSPVersions,
        tagClass: 'version-tag'
      },
      {
        id: RECIPE_SECTIONS.PREREQUISITES,
        title: 'Prerequisites',
        elementId: 'recipe-prerequisites',
        contentType: 'prerequisites',
        isVisible: () => this.hasArrayPrerequisites(),
        getData: () => this.getValidPrerequisites()
      },
      {
        id: 'building-permissions',
        title: 'Permission Sets for Building',
        elementId: 'recipe-building-permissions',
        contentType: 'list',
        isVisible: () => this.getPermissionSetsForBuilding().length > 0,
        getData: () => this.getPermissionSetsForBuilding()
      },
      {
        id: 'using-permissions',
        title: 'Permission Sets for Using',
        elementId: 'recipe-using-permissions',
        contentType: 'list',
        isVisible: () => this.getPermissionSetsForUsing().length > 0,
        getData: () => this.getPermissionSetsForUsing()
      },
      {
        id: 'download-executables',
        title: 'Download Executable Files',
        elementId: 'recipe-download-executables',
        contentType: 'download-list',
        isVisible: () => this.hasValidDownloadableExecutables(),
        getData: () => this.getValidDownloadableExecutables()
      },
      {
        id: RECIPE_SECTIONS.RELATED,
        title: 'Related Recipes',
        elementId: 'recipe-related',
        contentType: 'link-list',
        isVisible: () => this.hasValidRelatedRecipes(),
        getData: () => this.getValidRelatedRecipes()
      },
    ];
  }

  private generateOverviewSections(): Section[] {
    const sections: Section[] = [];
    const configs = this.getOverviewSectionConfigs();

    for (const config of configs) {
      if (config.alwaysShow || (config.isVisible && config.isVisible())) {
        sections.push({
          id: config.id,
          title: config.title,
          elementId: config.elementId
        });
      }
    }

    return sections;
  }

  getVisibleOverviewSections() {
    if (this.cachedRecipeId === this.currentRecipe?.id && this.cachedOverviewSections) {
      return this.cachedOverviewSections;
    }

    const configs = this.getOverviewSectionConfigs();
    const result = configs.filter(config =>
      config.alwaysShow || (config.isVisible && config.isVisible())
    ).map(config => ({
      ...config,
      data: config.getData ? config.getData() : null
    }));

    this.cachedRecipeId = this.currentRecipe?.id;
    this.cachedOverviewSections = result;

    return result;
  }

  private generateWalkthroughSections(): Section[] {
    const sections: Section[] = [];
    const walkthrough = this.currentRecipe?.walkthrough;

    if (Array.isArray(walkthrough)) {
      // Flatten tabs → steps so the legacy section list keeps a single sequential index.
      let flatIndex = 0;
      walkthrough.forEach(tab => {
        (tab.steps || []).forEach(step => {
          sections.push({
            id: `step-${flatIndex}`,
            title: step.step || `Step ${flatIndex + 1}`,
            elementId: `step-${flatIndex}`
          });
          flatIndex++;
        });
      });
    }
    return sections;
  }

  getOverviewSectionsForTOC(): Section[] {
    return this.generateOverviewSections();
  }

  getWalkthroughSectionsForTOC(): Section[] {
    return this.generateWalkthroughSections();
  }

  buildAssetPath(filePath: string): string {
    if (!this.currentRecipe || !filePath) return filePath;

    if (filePath.startsWith('/assets/')) {
      return filePath;
    }

    if (filePath.startsWith('assets/')) {
      return `/${filePath}`;
    }

    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    const normalizedSlug = (this.currentRecipe.slug || this.currentRecipe.id)
      .replace(/[\u2010-\u2015]/g, '_');
    return `/assets/recipes/${normalizedSlug}/${filePath}`;
  }

  private hasValidString(value: string | undefined): boolean {
    return !!(value && value.trim().length > 0);
  }

  hasValidOverview(): boolean {
    return this.hasValidString(this.currentRecipe?.overview);
  }

  hasValidGeneralUseCase(): boolean {
    return this.hasValidString(this.currentRecipe?.generalUseCase);
  }

  hasArrayPrerequisites(): boolean {
    if (!this.currentRecipe?.prerequisites || !Array.isArray(this.currentRecipe.prerequisites)) {
      return false;
    }

    return this.currentRecipe.prerequisites.some(prereq =>
      (prereq.description && prereq.description.trim().length > 0) ||
      (prereq.quickLinks && prereq.quickLinks.length > 0 &&
       prereq.quickLinks.some(link => link.title && link.title.trim().length > 0))
    );
  }

  hasValidDownloadableExecutables(): boolean {
    const executables = this.currentRecipe?.downloadableExecutables;
    return !!(executables && executables.length > 0 &&
              executables.some(exe =>
                (exe.filePath && exe.filePath.trim().length > 0)
              ));
  }

  hasValidRelatedRecipes(): boolean {
    const related = this.currentRecipe?.relatedRecipes;
    return !!(related && related.length > 0 &&
              related.some(recipe => recipe.title && recipe.title.trim().length > 0 &&
                                    recipe.url && recipe.url.trim().length > 0));
  }

  getPermissionSetsForBuilding(): string[] {
    if (!this.currentRecipe) return [];

    const buildingPermissions: string[] = [];
    if (Array.isArray(this.currentRecipe.prerequisites)) {
      this.currentRecipe.prerequisites.forEach(prereq => {
        if (prereq.description.toLowerCase().includes('permission') &&
            prereq.description.toLowerCase().includes('building')) {
          buildingPermissions.push(prereq.description);
        }
      });
    }

    return buildingPermissions;
  }

  getPermissionSetsForUsing(): string[] {
    if (!this.currentRecipe) return [];

    const usingPermissions: string[] = [];
    if (Array.isArray(this.currentRecipe.prerequisites)) {
      this.currentRecipe.prerequisites.forEach(prereq => {
        if (prereq.description.toLowerCase().includes('permission') &&
            prereq.description.toLowerCase().includes('using')) {
          usingPermissions.push(prereq.description);
        }
      });
    }

    return usingPermissions;
  }

  getValidDownloadableExecutables() {
    const executables = this.currentRecipe?.downloadableExecutables || [];
    return executables.filter(exe =>
      (exe.filePath && exe.filePath.trim().length > 0)
    ).map(exe => {
      if (exe.filePath && !exe.title && !exe.url) {
        const fileName = exe.filePath.split('/').pop() || exe.filePath;
        const titleFromFileName = fileName.replace(/\.[^/.]+$/, '');

        const correctUrl = this.buildAssetPath(exe.filePath);

        return {
          ...exe,
          title: titleFromFileName,
          url: correctUrl,
          originalFileName: fileName
        };
      }
      return exe;
    });
  }

  getValidRelatedRecipes() {
    const related = this.currentRecipe?.relatedRecipes || [];
    return related.filter(recipe => recipe.title && recipe.title.trim().length > 0 &&
                                   recipe.url && recipe.url.trim().length > 0);
  }

  getValidPrerequisites() {
    const prerequisites = this.currentRecipe?.prerequisites || [];
    if (!Array.isArray(prerequisites)) return [];

    return prerequisites.filter(prereq =>
      (prereq.description && prereq.description.trim().length > 0) ||
      (prereq.quickLinks && prereq.quickLinks.length > 0 &&
       prereq.quickLinks.some(link => link.title && link.title.trim().length > 0))
    );
  }

  getAllSectionsForRendering(): any[] {
    const sections: any[] = [];

    const overviewSections = this.getVisibleOverviewSections();
    sections.push(...overviewSections);

    const walkthrough = this.currentRecipe?.walkthrough;
    if (Array.isArray(walkthrough)) {
      // Flatten tabs → steps so downstream consumers (which still key by a single
      // step index) keep working until they're updated to know about tabs.
      let flatIndex = 0;
      walkthrough.forEach(tab => {
        (tab.steps || []).forEach(step => {
          const idx = flatIndex;
          sections.push({
            id: `step-${idx}`,
            title: step.step || `Step ${idx + 1}`,
            elementId: `step-${idx}`,
            contentType: 'walkthrough-step',
            isVisible: () => true,
            getData: () => step,
            data: step,
            stepIndex: idx
          });
          flatIndex++;
        });
      });
    }

    return sections;
  }
}