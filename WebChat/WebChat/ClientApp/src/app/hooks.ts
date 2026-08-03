import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store';

/**
 * Typed wrappers. Components should use these rather than the bare react-redux hooks so
 * state and dispatch are inferred instead of annotated at every call site.
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
