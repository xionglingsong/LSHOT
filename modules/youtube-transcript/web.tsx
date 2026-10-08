import { defineWebModule } from "@aihot/web/modules";
export default defineWebModule({
  name: "youtube-transcript",
  admin: { content: [{ to: "/admin/youtube-transcript", label: "YouTube 字幕" }] },
});
