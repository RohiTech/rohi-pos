import { Component } from 'react';

export class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected render error'
    };
  }

  componentDidCatch(error) {
    console.error('RouteErrorBoundary caught an error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.22em]">Error en la vista</p>
          <h2 className="mt-3 text-2xl font-semibold text-rose-800">No se pudo cargar esta pantalla</h2>
          <p className="mt-3 text-sm leading-6">
            {this.state.errorMessage}
          </p>
          <button
            className="mt-5 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
            onClick={() => window.location.reload()}
            type="button"
          >
            Recargar pantalla
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
