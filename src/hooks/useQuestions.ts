import { listQuestions, type Question } from '../questionStore';
import { useAsyncResource, type AsyncResource } from './useAsyncResource';

export function useQuestions(filter?: { datasetIds?: string[] }): AsyncResource<Question[]> {
  return useAsyncResource<Question[]>(() => listQuestions(filter));
}
