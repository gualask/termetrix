import { Component, type ComponentChildren } from 'preact';
import { AlertTriangle, RefreshCw } from 'lucide-preact';

interface Props {
	children: ComponentChildren;
	fallback?: ComponentChildren;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
		console.error('ErrorBoundary caught an error:', error, errorInfo);
	}

	handleReset = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div class="error-boundary">
					<div class="error-boundary-content">
						<AlertTriangle size={48} class="error-icon" />
						<h2>Something went wrong</h2>
						<p class="error-message">
							{this.state.error?.message || 'An unexpected error occurred'}
						</p>
						<button onClick={this.handleReset} class="error-reset-button">
							<RefreshCw size={16} />
							Reload UI
						</button>
						{this.state.error?.stack && (
							<details class="error-details">
								<summary>Technical details</summary>
								<pre>{this.state.error.stack}</pre>
							</details>
						)}
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
