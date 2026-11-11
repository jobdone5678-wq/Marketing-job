import type { Profile, FieldReport, Answer } from '../types';
import type { Field } from '../core/fields';

export interface FillContext {
  profile: Profile;
  resume?: File;
  learned: Answer[];
  overwrite: boolean;
  handled: Set<string>;
  extra: FieldReport[];
  onNavigate?: () => void;
  onProgress?: (fields: FieldReport[]) => void;
}

export interface Adapter {
  name: string;
  detect: (loc: Location, doc: Document) => boolean;
  resumeInput?: () => HTMLInputElement | null;
  waitResumeProcessed?: (input: HTMLInputElement | null, file: File) => Promise<boolean>;
  fillSpecial?: (ctx: FillContext) => Promise<void>;
  fillOne?: (ctx: FillContext, f: Field) => Promise<FieldReport | null | undefined>;
  fieldHint?: (el: HTMLElement) => string;
  nextButton?: () => HTMLElement | null;
  isFinalPage?: () => boolean;
  pageSignature?: () => string;
  hasErrors?: () => boolean;
}

