<<<<<<< HEAD
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
=======
import { MessageState, LoadingState } from './AsyncState';
import { contentState } from '../utils/uiState';
import { userFacingError } from '../utils/userFacingError';

export function AsyncPanel({ isLoading, error, isEmpty, onRetry, emptyTitle = 'Nothing here yet', emptyMessage = 'No records were returned.', children }: {
  isLoading: boolean; error: unknown; isEmpty: boolean; onRetry: () => void; emptyTitle?: string; emptyMessage?: string; children?: React.ReactNode;
}) {
  const state = contentState({ loading: isLoading, error: Boolean(error), empty: isEmpty });
  if (state === 'loading') return <LoadingState />;
  if (state === 'error') return <MessageState title="Could not load data" message={userFacingError(error)} onRetry={onRetry} />;
  if (state === 'empty') return <MessageState title={emptyTitle} message={emptyMessage} />;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  return <>{children}</>;
}
