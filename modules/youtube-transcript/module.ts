import { defineModule } from "@aihot/contracts/modules";
export default defineModule({
  name: "youtube-transcript",
  adminPages: [{ path: "admin/youtube-transcript", file: "web/import.tsx" }],
  apiPaths: [/^\/api\/admin\/youtube-transcript(?:\/|$)/],
});
