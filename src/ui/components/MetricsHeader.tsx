import { Fragment, type ComponentChildren } from 'preact';

export interface PrimaryMetric {
	title: string;
	icon: ComponentChildren;
	value: ComponentChildren;
	trailing?: ComponentChildren;
}

export interface SecondaryMetric {
	title: string;
	icon: ComponentChildren;
	content: ComponentChildren;
}

interface Props {
	ariaLabel: string;
	metricsAriaLabel: string;
	primary: PrimaryMetric;
	secondary?: SecondaryMetric[];
	actions?: ComponentChildren;
	caption?: ComponentChildren;
	captionAriaLive?: 'off' | 'polite' | 'assertive';
}

export function MetricsHeader({
	ariaLabel,
	metricsAriaLabel,
	primary,
	secondary = [],
	actions,
	caption,
	captionAriaLive = 'off',
}: Props) {
	return (
		<header class="tmx-header-card" aria-label={ariaLabel}>
			<div class="tmx-hero">
				<div class="tmx-hero-row">
					<div class="tmx-metrics-line" aria-label={metricsAriaLabel}>
						<span class="tmx-metric-primary" title={primary.title}>
							{primary.icon}
							<span class="tmx-metric-primaryValue">{primary.value}</span>
							{primary.trailing}
						</span>
						{secondary.map((metric, index) => (
							<Fragment key={`${metric.title}-${index}`}>
								<span class="tmx-metric-sep" aria-hidden="true">
									-
								</span>
								<span class="tmx-metric-secondary" title={metric.title}>
									{metric.icon}
									<span>{metric.content}</span>
								</span>
							</Fragment>
						))}
					</div>

					{actions && <div class="tmx-metric-actions">{actions}</div>}
				</div>

				{caption && (
					<div class="tmx-caption" aria-live={captionAriaLive}>
						{caption}
					</div>
				)}
			</div>
		</header>
	);
}
