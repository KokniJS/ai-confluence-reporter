import path from 'path';
import { fileURLToPath } from 'url';

export const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPORTS_DIR = path.join(PROJECT_ROOT, 'reports');
