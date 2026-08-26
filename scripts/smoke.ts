import { resolve } from "node:path";

import { renderVideo } from "@revideo/renderer";

await renderVideo({
  projectFile: resolve(process.cwd(), "src/project.tsx"),
  settings: {
    outFile: "smoke.mp4",
    outDir: resolve(process.cwd(), "out"),
    projectSettings: {
      size: { x: 1080, y: 1350 },
    },
  },
});
