import { FileText, FileX, Files, Loader2, Play, RefreshCw } from 'lucide-preact';
import type { LOCResult } from '../types';

interface Props {
	locResult: LOCResult | null;
	isCalculating: boolean;
	onCalculate: () => void;
	onOpenFile: (path: string) => void;
}

export function LocView({ locResult, isCalculating, onCalculate, onOpenFile }: Props) {
	const hasData = Boolean(locResult);

	const totalLines = hasData ? locResult!.totalLines.toLocaleString() : '—';
	const scannedFiles = hasData ? locResult!.scannedFiles.toLocaleString() : '—';
	const skippedFiles = hasData ? locResult!.skippedFiles.toLocaleString() : '—';

	const sortedLanguages = Object.entries(locResult?.byLanguage ?? {})
		.sort((a, b) => b[1] - a[1]);

	return (
		<>
			<header class="loc-header" aria-label="Lines of code">
				<div class="tmx-hero">
					<div class="tmx-hero-row">
						<div class="tmx-metrics-line" aria-label="LOC summary">
							<span class="tmx-metric-primary" title="Total lines of code">
								<FileText size={22} class="tmx-metric-primaryIcon" aria-hidden="true" />
								<span class="tmx-metric-primaryValue">{totalLines}</span>
								<span class="loc-primary-suffix">lines</span>
							</span>
							<span class="tmx-metric-sep" aria-hidden="true">-</span>
							<span class="tmx-metric-secondary" title="Scanned files">
								<Files size={14} aria-hidden="true" />
								<span>{scannedFiles} files</span>
							</span>
							<span class="tmx-metric-sep" aria-hidden="true">-</span>
							<span class="tmx-metric-secondary" title="Skipped files">
								<FileX size={14} aria-hidden="true" />
								<span>{skippedFiles} skipped</span>
							</span>
						</div>

						<div class="tmx-metric-actions">
							<button
								class="tmx-icon-button"
								onClick={onCalculate}
								disabled={isCalculating}
								title={hasData ? 'Recalculate LOC' : 'Calculate LOC'}
								aria-label={hasData ? 'Recalculate LOC' : 'Calculate LOC'}
							>
								{isCalculating ? (
									<Loader2 size={16} class="spinner" />
								) : hasData ? (
									<RefreshCw size={16} />
								) : (
									<Play size={16} />
								)}
							</button>
						</div>
					</div>

					<div class="tmx-caption">
						Scans source files only (respects .gitignore and skips common build/deps folders)
					</div>
				</div>
			</header>

			<section class="loc-panel" aria-label="LOC details">
				{hasData ? (
					<>
						<section class="section">
							<h4>By Language</h4>
							{sortedLanguages.map(([lang, lines]) => (
								<div key={lang} class="language-row">
									<div class="bar-container">
										<div
											class="bar"
											style={{ width: `${(lines / locResult!.totalLines) * 100}%` }}
										/>
									</div>
									<span class="lang-name">{lang}</span>
									<span class="lang-count">{lines.toLocaleString()}</span>
									<span class="lang-percent">
										{((lines / locResult!.totalLines) * 100).toFixed(1)}%
									</span>
								</div>
							))}
						</section>

						<section class="section">
							<h4>Top Files</h4>
							{locResult!.topFiles.map(file => (
								<button
									key={file.path}
									type="button"
									class="file-row"
									onClick={() => onOpenFile(file.path)}
									title={`Open ${file.path}`}
								>
									<span class="file-path">
										{file.path}
									</span>
									<span class="file-lines">{file.lines} lines</span>
								</button>
							))}
						</section>
					</>
				) : (
					<div class="empty-state">
						<p>No data yet.</p>
						<p class="hint">Use the ▶ button in the header to calculate LOC.</p>
					</div>
				)}

				{isCalculating && (
					<div class="tmx-panel-overlay" aria-live="polite">
						<Loader2 size={28} class="spinner" />
						<span>Calculating…</span>
					</div>
				)}
			</section>
		</>
	);
}
