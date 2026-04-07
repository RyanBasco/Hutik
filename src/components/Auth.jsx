import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Auth({ session }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codename, setCodename] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) setError(error.message);
    setLoading(false);
  };

 const handleEmailAuth = async (e) => {
  e.preventDefault();
  setError('');
  
  if (isRegistering && password !== confirmPassword) {
    setError("Passwords do not match!");
    return;
  }

  if (isRegistering && !codename.trim()) {
    setError("Please enter a codename!");
    return;
  }

  setLoading(true);

  try {
    if (isRegistering) {
      // 1. Sign up the user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { codename } }
      });

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          setError("This email is already in the void. Please Sign In instead.");
        } else {
          setError(signUpError.message);
        }
      } else if (data.user) {
        // 2. Insert into the profiles table
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: data.user.id, codename: codename }]);

        if (profileError) console.error("Profile Table Error:", profileError.message);

        // 3. IMMEDIATELY Sign Out before the UI can switch
        await supabase.auth.signOut();

        // 4. Clear the form and stay on the Auth page
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setCodename('');
        setIsRegistering(false);

        // 5. Show the success message
        setSuccessMessage(`Welcome to the void, ${codename}. Your account has been created. Please sign in to enter.`);
        
        // Clear success message after 6 seconds
        setTimeout(() => setSuccessMessage(''), 6000);
      }
    } else {
      // Regular Sign In Logic
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (signInError) setError(signInError.message);
    }
  } catch (err) {
    setError("An unexpected error occurred.");
  } finally {
    setLoading(false);
  }
};

  if (session) {
    return (
      <button 
        onClick={() => supabase.auth.signOut()} 
        className="text-red-500 hover:text-red-400 text-xs font-black uppercase tracking-widest transition-colors"
      >
        Logout
      </button>
    );
  }

  return (
    <>
      {successMessage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-300">
          <div className="bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[2.5rem] p-10 max-w-md shadow-2xl animate-in zoom-in duration-300">
            <div className="text-center">
              <div className="mb-4">
                <div className="w-12 h-12 bg-indigo-500/30 border border-indigo-400 rounded-full flex items-center justify-center mx-auto animate-pulse">
                  <span className="text-2xl">✓</span>
                </div>
              </div>
              <h3 className="text-2xl font-black text-white mb-4 tracking-tighter">Account Created!</h3>
              <p className="text-gray-300 text-sm leading-relaxed mb-6">{successMessage}</p>
              <button
                onClick={() => setSuccessMessage('')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
              >
                Continue to Sign In
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md p-8 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-2xl relative z-10 mx-auto">
      <div className="text-center mb-8">
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-xs text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleEmailAuth} className="space-y-4">
        {isRegistering && (
          <div className="animate-in fade-in slide-in-from-top duration-500">
            <label className="text-[10px] uppercase font-bold text-indigo-400 ml-2 mb-1 block">Your Secret Codename</label>
            <input 
              type="text" 
              placeholder="e.g. NeonGhost" 
              className="w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-white placeholder:text-gray-700 focus:ring-1 focus:ring-indigo-500 transition-all"
              value={codename} 
              onChange={(e) => setCodename(e.target.value)}
              required={isRegistering}
            />
          </div>
        )}

        <input 
          type="email" 
          placeholder="Email Address" 
          className="w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-white placeholder:text-gray-700 focus:ring-1 focus:ring-indigo-500 transition-all"
          value={email} 
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        
        <input 
          type="password" 
          placeholder="Password" 
          className="w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-white placeholder:text-gray-700 focus:ring-1 focus:ring-indigo-500 transition-all"
          value={password} 
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {isRegistering && (
          <input 
            type="password" 
            placeholder="Confirm Password" 
            className="w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-white placeholder:text-gray-700 focus:ring-1 focus:ring-indigo-500 transition-all animate-in fade-in duration-700"
            value={confirmPassword} 
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        )}

        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-white text-black py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all hover:bg-indigo-50 active:scale-95 shadow-xl disabled:opacity-50"
        >
          {loading ? "Processing..." : isRegistering ? "Initialize Account" : "Sign In"}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-white/10">
        <button 
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-2xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
          Sign In with Google
        </button>
      </div>

      <div className="mt-8 pt-6 border-t border-white/5 text-center">
        <button 
          type="button"
          onClick={() => {
            setIsRegistering(!isRegistering);
            setError('');
          }}
          className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
        >
          {isRegistering ? "Already a member? Sign In" : "New here? Create a Codename"}
        </button>
      </div>
      </div>
    </>
  );
}