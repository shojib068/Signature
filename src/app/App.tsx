import { useCallback, useEffect, useReducer, useState } from 'react';
import { loadDocument, validateFile } from '../features/upload';
import { closePdf } from '../features/viewer';
import { releaseSignature } from '../features/signature';
import { isConverterAvailable } from '../shared/api/convertClient';
import { AppError, toAppError } from '../shared/errors';
import { EditorScreen } from './EditorScreen';
import { ErrorBanner } from './ErrorBanner';
import { LandingScreen } from './LandingScreen';
import { initialState, reducer } from './state';

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  // null while checking. A static-only host has no converter: PDFs still work fully.
  const [converterAvailable, setConverterAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    void isConverterAvailable().then(setConverterAvailable);
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      dispatch({ type: 'ERROR', error: null });
      dispatch({ type: 'STATUS', status: 'loading' });
      try {
        const kind = await validateFile(file);
        if (kind === 'docx' && converterAvailable === false) throw new AppError('CONVERTER_UNAVAILABLE');
        const doc = await loadDocument(file, kind);
        dispatch({ type: 'DOC_LOADED', doc });
      } catch (error) {
        dispatch({ type: 'ERROR', error: toAppError(error, 'CORRUPT_FILE') });
      }
    },
    [converterAvailable],
  );

  const startOver = useCallback(() => {
    closePdf();
    dispatch({ type: 'RESET' });
  }, []);

  // Signature images exist only in memory; free their object URLs when the page goes away.
  useEffect(() => {
    const release = () => state.signatures.forEach(releaseSignature);
    window.addEventListener('pagehide', release);
    return () => window.removeEventListener('pagehide', release);
  }, [state.signatures]);

  const banner = state.error && (
    <ErrorBanner message={state.error.userMessage} onDismiss={() => dispatch({ type: 'ERROR', error: null })} />
  );

  if (!state.doc) {
    return (
      <>
        {banner}
        <LandingScreen
          onFile={openFile}
          busy={state.status === 'loading'}
          acceptsWord={converterAvailable !== false}
        />
      </>
    );
  }

  return (
    <EditorScreen
      state={state}
      dispatch={dispatch}
      banner={banner}
      converterAvailable={converterAvailable === true}
      onStartOver={startOver}
    />
  );
}
