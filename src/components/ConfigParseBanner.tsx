// Settings, above every section: a settings file this process could not
// parse. The server sends the path and a reason that never includes the
// file's contents. Nothing is shown when the list is empty.
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ConfigStatus } from "@/state/store";
import { copyText } from "@/lib/copy-text";
import { t } from "@/lib/i18n";

export function configParseWarnings(config: ConfigStatus | null | undefined): { path: string; reason: string }[] {
  const files = config?.ignoredFiles;
  if (!files?.length) return [];
  return files.filter((file) => file.path.trim() && file.reason.trim());
}

export function ConfigParseBanner({ config }: { config: ConfigStatus | null | undefined }) {
  const files = configParseWarnings(config);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  if (!files.length) return null;
  return (
    <div role="status" className="flex flex-col gap-2">
      {files.map((file) => (
        <div key={file.path} className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{t("settings.config.ignored", { path: file.path, reason: file.reason })}</span>
          <button
            type="button"
            className="shrink-0 rounded-md px-1.5 py-0.5 text-ink hover:bg-raised"
            onClick={() => {
              void copyText(file.path).then((result) => setCopiedPath(result === "copied" ? file.path : null));
            }}
          >
            {copiedPath === file.path ? t("settings.config.copied") : t("settings.config.copyPath")}
          </button>
        </div>
      ))}
    </div>
  );
}
