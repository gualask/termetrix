import { Dot } from 'lucide-preact';
import { type ComponentChildren, Fragment } from 'preact';

interface PrimaryMetric {
	title: string;
	icon: ComponentChildren;
	value: ComponentChildren;
	trailing?: ComponentChildren;
}

interface SecondaryMetric {
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
}

export function MetricsHeader({ ariaLabel, metricsAriaLabel, primary, secondary = [], actions }: Props) {
	return (
		<section class="tmx-header-card" aria-label={ariaLabel}>
			<div class="tmx-hero">
				<div class="tmx-hero-row">
					<div class="tmx-metrics-line" role="group" aria-label={metricsAriaLabel}>
						<span class="tmx-metric-primary" title={primary.title}>
							{primary.icon}
							<span class="tmx-metric-primaryValue">{primary.value}</span>
							{primary.trailing}
						</span>
						{secondary.map((metric) => (
							<Fragment key={metric.title}>
								<span class="tmx-metric-sep" aria-hidden="true">
									<Dot size={16} />
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
			</div>
		</section>
	);
}
