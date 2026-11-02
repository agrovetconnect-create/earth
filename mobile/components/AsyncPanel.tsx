import { LoadingState, MessageState } from './AsyncState';
import { useAppLanguage } from '../utils/language';
import { contentState } from '../utils/uiState';
import { userFacingError } from '../utils/userFacingError';

export function AsyncPanel({
  isLoading,
  error,
  isEmpty,
  onRetry,
  emptyTitle = 'No records yet',
  emptyMessage,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  onRetry: () => void;
  emptyTitle?: string;
  emptyMessage?: string;
  children?: React.ReactNode;
}) {
  const { t } = useAppLanguage();
  const state = contentState({ loading: isLoading, error: Boolean(error), empty: isEmpty });
  if (state === 'loading') return <LoadingState />;
  if (state === 'error') {
    return (
      <MessageState
        title={t('Could not load')}
        message={userFacingError(error)}
        onRetry={onRetry}
      />
    );
  }
  if (state === 'empty') {
    return (
      <MessageState
        title={t(emptyTitle)}
        message={emptyMessage ? t(emptyMessage) : undefined}
      />
    );
  }
  return <>{children}</>;
}
