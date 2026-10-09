// Substituto mínimo do supabase-js para o mapa visual (modo ?demo não usa a base de dados).
(() => {
  const ok = v => Promise.resolve({ data: v, error: null });
  const query = () => {
    const q = new Proxy(function () {}, {
      get: (_, k) => (k === 'then' ? (res, rej) => ok([]).then(res, rej) : () => q),
      apply: () => q,
    });
    return q;
  };
  window.supabase = {
    createClient: () => ({
      auth: {
        getSession: () => ok({ session: null }), refreshSession: () => ok({ session: null }), getUser: () => ok({ user: null }),
        signOut: () => ok(null), updateUser: () => ok(null), signInWithOAuth: () => ok(null),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: query, rpc: () => ok(null),
      storage: { from: () => ({ upload: () => ok({ path: 'demo' }), createSignedUrl: () => ok({ signedUrl: '' }) }) },
    }),
  };
})();
