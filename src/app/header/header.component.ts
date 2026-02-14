import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';

interface NavItem {
  label: string;
  link: string;
  hasMegaMenu?: boolean;
  isOpen: boolean;
  icon?: string;
  isExternal?: boolean;
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderComponent implements OnInit, OnDestroy {
  isPortrait = false;
  isMobile = false;
  isTablet = false;
  navOpen = false;

  navItems: NavItem[] = [
    //{ label: 'Home', link: '/home', isOpen: false },
    //{ label: 'Rules Engines', link: '/rules-engines', hasMegaMenu: true, isOpen: false },
    //{ label: 'Solutions', link: '/solutions', hasMegaMenu: true, isOpen: false },
    //{ label: 'FAQ', link: '/', isOpen: false },
    //{ label: 'Recipes', link: '/recipes', isOpen: false },
    //{ label: 'Setup', link: '/setup', isOpen: false },
    //{ label: 'Support', link: '/support', hasMegaMenu: true, isOpen: false },
    //{ label: 'Pricing', link: '/pricing', isOpen: false },
    //{ label: 'Designer Guide', link:'/designer-guide', isOpen: false}
  ];

  private orientationQuery!: MediaQueryList;
  private mobileQuery!: MediaQueryList;
  private tabletQuery!: MediaQueryList;
  private orientationChangeHandler!: () => void;
  private mobileChangeHandler!: () => void;
  private tabletChangeHandler!: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.setupResponsiveQueries();
    this.setupEventHandlers();
    this.attachEventListeners();
  }

  ngOnDestroy(): void {
    this.removeEventListeners();
  }

  toggleNav(): void {
    this.navOpen = !this.navOpen;
    if (!this.navOpen) {
      this.navItems.forEach(item => (item.isOpen = false));
    }
    this.cdr.detectChanges();
  }

  onNavItemClick(index: number): void {
    if (this.isMobile && this.navItems[index].hasMegaMenu) {
      this.navItems[index].isOpen = !this.navItems[index].isOpen;
      this.cdr.detectChanges();
    }
  }



  private setupResponsiveQueries(): void {
    this.orientationQuery = window.matchMedia('(orientation: portrait)');
    this.mobileQuery = window.matchMedia('(max-width: 768px)');
    this.tabletQuery = window.matchMedia('(max-width: 1024px)');

    // Set initial values
    this.isPortrait = this.orientationQuery.matches;
    this.isMobile = this.mobileQuery.matches;
    this.isTablet = this.tabletQuery.matches;
  }

  private setupEventHandlers(): void {
    this.orientationChangeHandler = () => {
      this.isPortrait = this.orientationQuery.matches;
      this.resetNavigation();
      this.cdr.detectChanges();
    };

    this.mobileChangeHandler = () => {
      this.isMobile = this.mobileQuery.matches;
      this.resetNavigation();
      this.cdr.detectChanges();
    };

    this.tabletChangeHandler = () => {
      this.isTablet = this.tabletQuery.matches;
      this.resetNavigation();
      this.cdr.detectChanges();
    };
  }

  private attachEventListeners(): void {
    // Orientation listener
    if (this.orientationQuery.addEventListener) {
      this.orientationQuery.addEventListener('change', this.orientationChangeHandler);
    } else {
      this.orientationQuery.addListener(this.orientationChangeHandler);
    }

    // Mobile listener
    if (this.mobileQuery.addEventListener) {
      this.mobileQuery.addEventListener('change', this.mobileChangeHandler);
    } else {
      this.mobileQuery.addListener(this.mobileChangeHandler);
    }

    // Tablet listener
    if (this.tabletQuery.addEventListener) {
      this.tabletQuery.addEventListener('change', this.tabletChangeHandler);
    } else {
      this.tabletQuery.addListener(this.tabletChangeHandler);
    }
  }

  private removeEventListeners(): void {
    // Remove orientation listener
    if (this.orientationQuery.removeEventListener) {
      this.orientationQuery.removeEventListener('change', this.orientationChangeHandler);
    } else {
      this.orientationQuery.removeListener(this.orientationChangeHandler);
    }

    // Remove mobile listener
    if (this.mobileQuery.removeEventListener) {
      this.mobileQuery.removeEventListener('change', this.mobileChangeHandler);
    } else {
      this.mobileQuery.removeListener(this.mobileChangeHandler);
    }

    // Remove tablet listener
    if (this.tabletQuery.removeEventListener) {
      this.tabletQuery.removeEventListener('change', this.tabletChangeHandler);
    } else {
      this.tabletQuery.removeListener(this.tabletChangeHandler);
    }
  }

  private resetNavigation(): void {
    this.navOpen = false;
    this.navItems.forEach(item => (item.isOpen = false));
  }
}
