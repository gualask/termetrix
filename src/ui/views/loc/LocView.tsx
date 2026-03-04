import { useMemo } from 'preact/hooks';
import { ChevronDown, ChevronRight, FileText, FileX, Files, RefreshCw, Square } from 'lucide-preact';
import type { LOCResult } from '../../types';
import { IconButton } from '../../components/IconButton';
import { InfoTooltip } from '../../components/InfoTooltip';
import { PanelOverlay } from '../../components/PanelOverlay';
import { EmptyState } from '../../components/EmptyState';
import { RowButton } from '../../components/RowButton';
import { MetricsHeader } from '../../components/MetricsHeader';
import { ViewLayout } from '../../components/ViewLayout';

const LOC_VISIBLE_LANGUAGES = 3;
const LOC_VISIBLE_FILES = 3;
const LOC_TOOLTIP_LINES = ['Scans source files only', 'Respects .gitignore, skips common build/deps folders'];

interface ShowMoreButtonProps {
	total: number;
	visible: number;
	showAll: boolean;
	onToggle: () => void;
}

function ShowMoreButton({ total, visible, showAll, onToggle }: ShowMoreButtonProps) {
	if (total <= visible) return null;
	return (
		<button type="button" class="tmx-show-more" onClick={onToggle}>
			{showAll ? 'Show less' : `Show ${total - visible} more`}
		</button>
	);
}

interface LocByLanguageSectionProps {
	sortedLanguages: Array<[string, number]>;
	totalLines: number;
	showAll: boolean;
	onToggleShowAll: () => void;
}

function LocByLanguageSection({ sortedLanguages, totalLines, showAll, onToggleShowAll }: LocByLanguageSectionProps) {
	const visible = showAll ? sortedLanguages : sortedLanguages.slice(0, LOC_VISIBLE_LANGUAGES);

	return (
		<section class="section">
			<h4>By Language</h4>
			{visible.map(([lang, lines]) => {
				const percent = (lines / totalLines) * 100;
				return (
					<div key={lang} class="language-row">
						<span class="lang-name">{lang}</span>
						<div class="bar-container">
							<div class="bar" style={{ width: `${percent}%` }} />
						</div>
						<span class="lang-count">{lines.toLocaleString()}</span>
						<span class="lang-percent">{percent.toFixed(1)}%</span>
					</div>
				);
			})}
			<ShowMoreButton
				total={sortedLanguages.length}
				visible={LOC_VISIBLE_LANGUAGES}
				showAll={showAll}
				onToggle={onToggleShowAll}
			/>
		</section>
	);
}

interface LocTopFilesSectionProps {
	topFiles: LOCResult['topFiles'];
	onOpenFile: (path: string) => void;
	showAll: boolean;
	onToggleShowAll: () => void;
}

function LocTopFilesSection({ topFiles, onOpenFile, showAll, onToggleShowAll }: LocTopFilesSectionProps) {
	const visible = showAll ? topFiles : topFiles.slice(0, LOC_VISIBLE_FILES);

	return (
		<section class="section">
			<h4>Top Files</h4>
			{visible.map(file => (
				<RowButton
					key={file.path}
					class="file-row"
					onClick={() => onOpenFile(file.path)}
					title={`Open ${file.path}`}
					ariaLabel={`Open ${file.path}`}
				>
					<span class="file-path">{file.path}</span>
					<span class="file-lines">{file.lines} lines</span>
				</RowButton>
			))}
			<ShowMoreButton
				total={topFiles.length}
				visible={LOC_VISIBLE_FILES}
				showAll={showAll}
				onToggle={onToggleShowAll}
			/>
		</section>
	);
}

interface Props {
	locResult: LOCResult | null;
	isCalculating: boolean;
	hasRoot: boolean;
	onRefreshOrCancel: () => void;
	onOpenFile: (path: string) => void;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
	showAllFiles: boolean;
	onToggleShowAllFiles: () => void;
	showAllLanguages: boolean;
	onToggleShowAllLanguages: () => void;
}

export function LocView({
	locResult,
	isCalculating,
	hasRoot,
	onRefreshOrCancel,
	onOpenFile,
	isCollapsed,
	onToggleCollapse,
	showAllFiles,
	onToggleShowAllFiles,
	showAllLanguages,
	onToggleShowAllLanguages,
}: Props) {
	const hasData = Boolean(locResult);

	const totalLines = locResult?.totalLines.toLocaleString() ?? '—';
	const scannedFiles = locResult?.scannedFiles.toLocaleString() ?? '—';
	const skippedFiles = locResult?.skippedFiles.toLocaleString() ?? '—';

	const sortedLanguages = useMemo(
		() => Object.entries(locResult?.byLanguage ?? {}).sort((a, b) => b[1] - a[1]),
		[locResult]
	);

	const CollapseIcon = isCollapsed ? ChevronRight : ChevronDown;

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
				<>
					<InfoTooltip lines={LOC_TOOLTIP_LINES} />
					{hasRoot && (
						<IconButton
							onClick={onRefreshOrCancel}
							title={isCalculating ? 'Cancel LOC scan' : 'Recalculate LOC'}
							ariaLabel={isCalculating ? 'Cancel LOC scan' : 'Recalculate LOC'}
						>
							{isCalculating ? <Square size={16} /> : <RefreshCw size={16} />}
						</IconButton>
					)}
					<IconButton
						onClick={onToggleCollapse}
						title={isCollapsed ? 'Expand LOC section' : 'Collapse LOC section'}
						ariaLabel={isCollapsed ? 'Expand LOC section' : 'Collapse LOC section'}
					>
						<CollapseIcon size={16} />
					</IconButton>
				</>
			}
		/>
	);

	return (
		<ViewLayout viewClass="loc-view" header={header} bodyAriaLabel="LOC details" isCollapsed={isCollapsed} scrollable>
			{isCalculating && <PanelOverlay label="Calculating…" />}
			{hasData ? (
				<>
					<LocByLanguageSection
						sortedLanguages={sortedLanguages}
						totalLines={locResult!.totalLines}
						showAll={showAllLanguages}
						onToggleShowAll={onToggleShowAllLanguages}
					/>
					<LocTopFilesSection
						topFiles={locResult!.topFiles}
						onOpenFile={onOpenFile}
						showAll={showAllFiles}
						onToggleShowAll={onToggleShowAllFiles}
					/>
				</>
			) : !isCalculating && (
				<EmptyState
					variant="panel"
					message={hasRoot ? 'No LOC data available.' : 'No workspace folder open.'}
					hint={hasRoot
						? 'Use the recalculate button to scan.'
						: 'Open a folder or workspace to get started.'}
				/>
			)}
		</ViewLayout>
	);
}
