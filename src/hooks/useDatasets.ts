import { listDatasets, type Dataset } from '../datasetStore';
import { useAsyncResource, type AsyncResource } from './useAsyncResource';

export function useDatasets(): AsyncResource<Dataset[]> {
  return useAsyncResource<Dataset[]>(listDatasets);
}
