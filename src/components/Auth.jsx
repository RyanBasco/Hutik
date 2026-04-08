import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSocialLogin = async (provider) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: window.location.origin }
    });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: true,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your inbox! A secure entry link has been sent.");
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-md p-8 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-xl font-black tracking-widest uppercase text-white/80">Enter the Void</h2>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-2">No passwords. Just presence.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300 text-[10px] font-bold text-center uppercase">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-4 p-3 bg-indigo-500/20 border border-indigo-500/50 rounded-xl text-indigo-300 text-[10px] font-bold text-center uppercase animate-pulse">
          {message}
        </div>
      )}

      <form onSubmit={handleMagicLink} className="space-y-4">
        <input 
          type="email" 
          placeholder="Enter your email" 
          className="w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-white placeholder:text-gray-700 focus:ring-1 focus:ring-indigo-500 outline-none cursor-text"
          value={email} 
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-white text-black py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-50 transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Sending..." : "Sign in with Email"}
        </button>
      </form>

      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-white/10"></span>
        </div>
        <div className="relative flex justify-center text-[10px] uppercase">
          <span className="bg-[#0a0a0a] px-4 text-gray-500 tracking-widest">Fast Access</span>
        </div>
      </div>

      <div className="flex justify-center">
        <button 
          onClick={() => handleSocialLogin('google')} 
          className="flex w-full items-center justify-center gap-3 bg-white/10 hover:bg-white/20 text-white py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all cursor-pointer border border-white/5"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="Google" />
          Continue with Google
        </button>
      </div>

      <p className="mt-8 text-center text-[9px] text-gray-600 uppercase tracking-[0.3em]">
        Hutik &bull; Iloilo City
      </p>
    </div>
  );
}