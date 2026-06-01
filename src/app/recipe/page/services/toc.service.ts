import { Injectable } from '@angular/core';
import { Recipe, Section, Tab } from '../../core/models/recipe.model';
import { RECIPE_SECTIONS } from '../../core/constants/recipe.constants';

interface SectionConfig {
  id: string;
  title: string;
  elementId: string;
  isVisible: () => boolean;
  alwaysShow?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TocService {

  private currentRecipe: Recipe | null = null;

  constructor() { }

  setCurrentRecipe(recipe: Recipe | null): void {
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
        isVisible: () => this.hasValidOverview(),
        alwaysShow: true
      },
      {
        id: RECIPE_SECTIONS.GENERAL_USE_CASE,
        title: 'General Use Case',
        elementId: 'recipe-general-use-case',
        isVisible: () => this.hasValidGeneralUseCase()
      },
      {
        id: 'dsp-versions',
        title: 'Supported DSP Versions',
        elementId: 'recipe-dsp-versions',
        isVisible: () => !!(this.currentRecipe?.DSPVersions?.length && this.currentRecipe.DSPVersions.length > 0)
      },
      {
        id: RECIPE_SECTIONS.PREREQUISITES,
        title: 'Prerequisites',
        elementId: 'recipe-prerequisites',
        isVisible: () => this.hasArrayPrerequisites()
      },
      {
        id: 'building-permissions',
        title: 'Permission Sets for Building',
        elementId: 'recipe-building-permissions',
        isVisible: () => this.getPermissionSetsForBuilding().length > 0
      },
      {
        id: 'using-permissions',
        title: 'Permission Sets for Using',
        elementId: 'recipe-using-permissions',
        isVisible: () => this.getPermissionSetsForUsing().length > 0
      },
      {
        id: 'download-executables',
        title: 'Download Executable Files',
        elementId: 'recipe-download-executables',
        isVisible: () => this.hasValidDownloadableExecutables()
      },
      {
        id: RECIPE_SECTIONS.RELATED,
        title: 'Related Recipes',
        elementId: 'recipe-related',
        isVisible: () => this.hasValidRelatedRecipes()
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

  private hasValidString(value: string | undefined): boolean {
    return !!(value && value.trim().length > 0);
  }

  private hasValidOverview(): boolean {
    return this.hasValidString(this.currentRecipe?.overview);
  }

  private hasValidGeneralUseCase(): boolean {
    return this.hasValidString(this.currentRecipe?.generalUseCase);
  }

  private hasArrayPrerequisites(): boolean {
    if (!this.currentRecipe?.prerequisites || !Array.isArray(this.currentRecipe.prerequisites)) {
      return false;
    }

    return this.currentRecipe.prerequisites.some(prereq =>
      (prereq.description && prereq.description.trim().length > 0) ||
      (prereq.quickLinks && prereq.quickLinks.length > 0 &&
       prereq.quickLinks.some(link => link.title && link.title.trim().length > 0))
    );
  }

  private hasValidDownloadableExecutables(): boolean {
    const executables = this.currentRecipe?.downloadableExecutables;
    return !!(executables && executables.length > 0 &&
              executables.some(exe =>
                (exe.filePath && exe.filePath.trim().length > 0)
              ));
  }

  private hasValidRelatedRecipes(): boolean {
    const related = this.currentRecipe?.relatedRecipes;
    return !!(related && related.length > 0 &&
              related.some(recipe => recipe.title && recipe.title.trim().length > 0 &&
                                    recipe.url && recipe.url.trim().length > 0));
  }

  private getPermissionSetsForBuilding(): string[] {
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

  private getPermissionSetsForUsing(): string[] {
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
}
