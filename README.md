# mdtk-quiz
## Video (Remotion)

`video/` 是用 `npx create-video@latest --hello-world` 建立的 Remotion 專案。

```bash
cd video
npm install
npm run dev                                      # 開啟 Remotion Studio 預覽
npx remotion render HelloWorld out/video.mp4     # 輸出 MP4
```

Agent skills（安裝在 `.claude/skills/`，版本鎖定在 `skills-lock.json`）：

- `npx skills add remotion-dev/skills`
- `npx skills add heygen-com/hyperframes`
