/**
 * Template Service for Bridge-Payments
 * Handles email template loading and variable replacement
 * Supports i18n with fallback to English
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface TemplateVariables {
  [key: string]: string | number | undefined;
}

interface SubjectTranslations {
  [key: string]: string;
}

export class TemplateService {
  private templatesPath: string;
  private defaultLanguage: string = 'en';
  private supportedLanguages: string[] = ['en', 'es'];

  constructor() {
    // Get templates path relative to the current file
    this.templatesPath = join(__dirname, 'templates');
  }

  /**
   * Get language from environment or default
   */
  private getLanguage(): string {
    const envLang = process.env.GLOBAL_LANG || process.env.DEFAULT_LANGUAGE;
    
    if (envLang && this.supportedLanguages.includes(envLang)) {
      return envLang;
    }
    
    return this.defaultLanguage;
  }

  /**
   * Load template file with fallback
   */
  private loadTemplate(templateName: string, language: string): string | null {
    const templatePath = join(this.templatesPath, language, `${templateName}.html`);
    
    if (existsSync(templatePath)) {
      try {
        return readFileSync(templatePath, 'utf-8');
      } catch (error) {
        console.error(`[TemplateService] Error reading template ${templatePath}:`, error);
        return null;
      }
    }
    
    return null;
  }

  /**
   * Load subject translations
   */
  private loadSubjects(language: string): SubjectTranslations {
    const subjectsPath = join(this.templatesPath, language, 'subjects.json');
    
    if (existsSync(subjectsPath)) {
      try {
        const content = readFileSync(subjectsPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.error(`[TemplateService] Error reading subjects ${subjectsPath}:`, error);
        return {};
      }
    }
    
    return {};
  }

  /**
   * Replace variables in template content
   */
  private replaceVariables(content: string, variables: TemplateVariables): string {
    let result = content;
    
    // Replace {{variable}} patterns
    for (const [key, value] of Object.entries(variables)) {
      if (value !== undefined) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        result = result.replace(regex, String(value));
      }
    }
    
    // Remove any remaining unreplaced variables
    result = result.replace(/{{[^}]+}}/g, '');
    
    return result;
  }

  /**
   * Get template content with variable replacement
   */
  getTemplate(
    templateName: string, 
    variables: TemplateVariables = {},
    language?: string
  ): { html: string; subject: string } | null {
    const lang = language || this.getLanguage();
    
    // Try to load template in requested language
    let templateContent = this.loadTemplate(templateName, lang);
    
    // Fallback to default language if not found
    if (!templateContent && lang !== this.defaultLanguage) {
      console.log(`[TemplateService] Template ${templateName} not found in ${lang}, falling back to ${this.defaultLanguage}`);
      templateContent = this.loadTemplate(templateName, this.defaultLanguage);
    }
    
    if (!templateContent) {
      console.error(`[TemplateService] Template ${templateName} not found in any language`);
      return null;
    }
    
    // Load subjects
    let subjects = this.loadSubjects(lang);
    if (!subjects[templateName] && lang !== this.defaultLanguage) {
      subjects = this.loadSubjects(this.defaultLanguage);
    }
    
    // Add default variables
    const defaultVariables: TemplateVariables = {
      current_year: new Date().getFullYear(),
      current_date: new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US'),
      current_time: new Date().toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-US'),
      ...variables
    };
    
    // Replace variables in template
    const html = this.replaceVariables(templateContent, defaultVariables);
    
    // Replace variables in subject
    const subjectTemplate = subjects[templateName] || `Transaction Receipt - ${defaultVariables.transaction_id || 'Unknown'}`;
    const subject = this.replaceVariables(subjectTemplate, defaultVariables);
    
    return { html, subject };
  }

  /**
   * Get available languages
   */
  getAvailableLanguages(): string[] {
    return [...this.supportedLanguages];
  }

  /**
   * Check if template exists
   */
  templateExists(templateName: string, language?: string): boolean {
    const lang = language || this.getLanguage();
    const templatePath = join(this.templatesPath, lang, `${templateName}.html`);
    return existsSync(templatePath);
  }

  /**
   * Get template path for debugging
   */
  getTemplatePath(templateName: string, language?: string): string {
    const lang = language || this.getLanguage();
    return join(this.templatesPath, lang, `${templateName}.html`);
  }
}

// Export singleton instance
export const templateService = new TemplateService();
