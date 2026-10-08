// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";

import transcript from "@aihot/youtube-transcript/web";

export const WEB_MODULES: readonly WebModule[] = [transcript];
