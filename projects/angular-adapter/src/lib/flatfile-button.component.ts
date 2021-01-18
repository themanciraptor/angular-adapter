import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import FlatfileImporter, { FieldHookCallback } from '@flatfile/adapter';
import CustomerObject from '@flatfile/adapter/build/main/obj.customer';
import LoadOptionsObject from '@flatfile/adapter/build/main/obj.load-options';
import FlatfileResults from '@flatfile/adapter/build/main/results';
import { RecordInitOrChangeCallback } from './interfaces/general';
import { ISettings } from './interfaces/settings';

@Component({
  selector: 'flatfile-button',
  template: `
    <button *ngIf="isImporterLoaded; else failedLoading" (click)="launch()">
      <ng-content #ref></ng-content>
      <span *ngIf="isButtonPresent">🔼 Upload with Flatfile</span>
    </button>

    <ng-template #failedLoading> Failed to load importer </ng-template>
  `,
})
export class FlatfileButtonComponent implements OnInit, OnDestroy {

  @Input() settings: ISettings;
  @Input() licenseKey: string;
  @Input() customer: CustomerObject;

  @Input() fieldHooks?: Record<string, FieldHookCallback>;
  @Input() onData?: (results: FlatfileResults) => Promise<string | void>;
  @Input() onRecordInit?: RecordInitOrChangeCallback;
  @Input() onRecordChange?: RecordInitOrChangeCallback;
  @Input() source?: LoadOptionsObject['source'];

  @Output() cancel?: EventEmitter<void> = new EventEmitter<void>();

  @ViewChild('ref', { static: true }) ref: HTMLElement;

  private _isImporterLoaded = true;
  private flatfileImporter: FlatfileImporter;

  get isImporterLoaded(): boolean {
    return this._isImporterLoaded;
  }

  get isButtonPresent(): boolean {
    return this.ref && !this.ref.innerHTML.trim();
  }

  public ngOnInit(): void {
    this.validateInputs();

    this.flatfileImporter = new FlatfileImporter(
      this.licenseKey,
      this.settings,
      this.customer
    );

    if (this.fieldHooks) {
      for (const key in this.fieldHooks) {
        if (key) {
          this.flatfileImporter.registerFieldHook(key, this.fieldHooks[key]);
        }
      }
    }
    if (this.onRecordChange || this.onRecordInit) {
      this.flatfileImporter.registerRecordHook(
        async (record: any, index: number, eventType: string) => {
          if (eventType === 'init' && this.onRecordInit) {
            return await this.onRecordInit(record, index);
          }
          if (eventType === 'change' && this.onRecordChange) {
            return await this.onRecordChange(record, index);
          }
        }
      );
    }
  }

  public ngOnDestroy(): void {
    this.flatfileImporter.close();
  }

  public launch(): void {
    const dataHandler = (results: FlatfileResults) => {
      this.flatfileImporter?.displayLoader();

      this.onData(results).then(
        (optionalMessage?: string | void) => {
          this.flatfileImporter?.displaySuccess(optionalMessage || 'Success!');
        },
        (error: any) => {
          this.flatfileImporter
            ?.requestCorrectionsFromUser(
              error instanceof Error ? error.message : error
            )
            .then(dataHandler, () => this.cancel.next());
        }
      );
    };

    if (!this.flatfileImporter) {
      this._isImporterLoaded = false;
      return;
    }
    const loadOptions: LoadOptionsObject | undefined = this.source
      ? { source: this.source }
      : undefined;
    this.flatfileImporter
      .requestDataFromUser(loadOptions)
      .then(dataHandler, () => this.cancel.next());
  }

  private validateInputs(): void {
    if (!this.licenseKey) {
      console.error(
        '[Error] Flatfile Angular Adapter - licenseKey not provided!'
      );
      this._isImporterLoaded = false;
    }
    if (!this.customer?.userId) {
      console.error(
        '[Error] Flatfile Angular Adapter - customer userId not provided!'
      );
      this._isImporterLoaded = false;
    }
  }
}
