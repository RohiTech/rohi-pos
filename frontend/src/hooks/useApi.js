import { useEffect, useState } from 'react';

export function useApi(requestFactory, dependencies = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function run() {
      setLoading(true);
      setError('');

      try {
        const response = await requestFactory();
        if (isMounted) {
          setData(response);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message || 'Unexpected error');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      isMounted = false;
    };
  }, dependencies);

  return { data, loading, error };
}
