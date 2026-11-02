interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
  tone?: 'error' | 'info';
}

export function ErrorBanner({ message, onDismiss, tone = 'error' }: ErrorBannerProps) {
  return (
    <div className="banner" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <p>{message}</p>
      <button type="button" className="icon-button" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
