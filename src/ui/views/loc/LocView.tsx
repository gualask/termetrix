import { useMemo } from 'preact/hooks';
import { FileText, FileX, Files, Loader2, Play, RefreshCw } from 'lucide-preact';
import type { LOCResult } from '../../types';
import { IconButton } from '../../components/IconButton';
import { PanelOverlay } from '../../components/PanelOverlay';
import { EmptyState } from '../../components/EmptyState';
import { ViewLayout } from '../../components/ViewLayout';
import { RowButton } from '../../components/RowButton';
import { MetricsHeader } from '../../components/MetricsHeader';

interface Props {
	locResult: LOCResult | null;
	isCalculating: boolean;
	onCalculate: () => void;
	onOpenFile: (path: string) => void;
}

interface LocByLanguageSectionProps {
	sortedLanguages: Array<[string, number]>;
	totalLines: number;
}

function LocByLanguageSection({ sortedLanguages, totalLines }: LocByLanguageSectionProps) {
	return (
		<section class="section">
			<h4>By Language</h4>
			{sortedLanguages.map(([lang, lines]) => (
				<div key={lang} class="language-row">
					<div class="bar-container">
						<div class="bar" style={{ width: `${(lines / totalLines) * 100}%` }} />
					</div>
					<span class="lang-name">{lang}</span>
					<span class="lang-count">{lines.toLocaleString()}</span>
					<span class="lang-percent">{((lines / totalLines) * 100).toFixed(1)}%</span>
				</div>
			))}
		</section>
	);
}

interface LocTopFilesSectionProps {
	topFiles: LOCResult['topFiles'];
	onOpenFile: (path: string) => void;
}

function LocTopFilesSection({ topFiles, onOpenFile }: LocTopFilesSectionProps) {
	return (
		<section class="section">
			<h4>Top Files</h4>
			{topFiles.map(file => (
				<RowButton
					key={file.path}
					class="file-row"
					onClick={() => onOpenFile(file.path)}
					title={`Open ${file.path}`}
				>
					<span class="file-path">{file.path}</span>
					<span class="file-lines">{file.lines} lines</span>
				</RowButton>
			))}
		</section>
	);
}

export function LocView({ locResult, isCalculating, onCalculate, onOpenFile }: Props) {
	const hasData = Boolean(locResult);

	const totalLines = hasData ? locResult!.totalLines.toLocaleString() : '—';
	const scannedFiles = hasData ? locResult!.scannedFiles.toLocaleString() : '—';
	const skippedFiles = hasData ? locResult!.skippedFiles.toLocaleString() : '—';

	// Memoize language sorting to avoid recalculation on every render
	const sortedLanguages = useMemo(
		() => Object.entries(locResult?.byLanguage ?? {}).sort((a, b) => b[1] - a[1]),
		[locResult]
	);

	const header = (
		<MetricsHeader
			ariaLabel="Lines of code"
			metricsAriaLabel="LOC summary"
			primary={{
				title: 'Total lines of code',
				icon: <FileText size={22} class="tmx-metric-primaryIcon" aria-hidden="true" />,
				value: totalLines,
				trailing: <span class="loc-primary-suffix">lines</span>
			}}
			secondary={[
				{
					title: 'Scanned files',
					icon: <Files size={14} aria-hidden="true" />,
					content: `${scannedFiles} files`
				},
				{
					title: 'Skipped files',
					icon: <FileX size={14} aria-hidden="true" />,
					content: `${skippedFiles} skipped`
				}
			]}
			actions={
				<IconButton
					onClick={onCalculate}
					disabled={isCalculating}
					title={hasData ? 'Recalculate LOC' : 'Calculate LOC'}
					ariaLabel={hasData ? 'Recalculate LOC' : 'Calculate LOC'}
				>
					{isCalculating ? (
						<Loader2 size={16} class="spinner" />
					) : hasData ? (
						<RefreshCw size={16} />
					) : (
						<Play size={16} />
					)}
				</IconButton>
			}
			caption="Scans source files only (respects .gitignore and skips common build/deps folders)"
		/>
	);

	return (
		<ViewLayout viewClass="loc-view" header={header} panelVariant="scroll" panelAriaLabel="LOC details">
			{hasData ? (
				<>
					<LocByLanguageSection
						sortedLanguages={sortedLanguages}
						totalLines={locResult!.totalLines}
					/>

					<LocTopFilesSection topFiles={locResult!.topFiles} onOpenFile={onOpenFile} />
				</>
			) : (
				<EmptyState
					variant="panel"
						message="No data yet."
						hint="Use the ▶ button in the header to calculate LOC."
					/>
				)}

				{isCalculating && (
					<PanelOverlay label="Calculating…" />
				)}
		</ViewLayout>
	);
}
