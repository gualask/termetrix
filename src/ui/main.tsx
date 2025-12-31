import { render } from 'preact';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

render(
	<ErrorBoundary>
		<App />
	</ErrorBoundary>,
	document.body
);
