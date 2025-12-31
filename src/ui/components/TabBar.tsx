import { Database, FileCode } from 'lucide-preact';

export type Tab = 'size' | 'loc';

interface Props {
	activeTab: Tab;
	onTabChange: (tab: Tab) => void;
}

export function TabBar({ activeTab, onTabChange }: Props) {
	return (
		<div class="tabs" role="tablist" aria-label="Termetrix tabs">
			<button
				class={activeTab === 'size' ? 'active' : ''}
				onClick={() => onTabChange('size')}
				role="tab"
				aria-selected={activeTab === 'size'}
			>
				<Database size={16} /> Size
			</button>
			<button
				class={activeTab === 'loc' ? 'active' : ''}
				onClick={() => onTabChange('loc')}
				role="tab"
				aria-selected={activeTab === 'loc'}
			>
				<FileCode size={16} /> LOC
			</button>
		</div>
	);
}
