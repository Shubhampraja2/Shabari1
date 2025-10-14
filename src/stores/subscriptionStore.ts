import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SubscriptionState {
  isPremium: boolean;
  subscriptionExpiresAt: string | null;
  isLoading: boolean;
  error: string | null;
  checkSubscriptionStatus: () => Promise<void>;
  upgradeToPremium: () => Promise<void>;
  downgradToFree: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      isPremium: false, // Set to false for production - users start with free tier
      subscriptionExpiresAt: null,
      isLoading: false,
      error: null,

      checkSubscriptionStatus: async () => {
        set({ isLoading: true, error: null });
        try {
          // Import auth store at runtime to avoid circular dependency
          const { useAuthStore } = await import('./authStore');
          const authUser = useAuthStore.getState().user;
          
          if (authUser) {
            // User is logged in, use their database premium status
            console.log('🔍 Checking premium status from database:', authUser.is_premium ? 'Premium' : 'Free');
            console.log('👤 User email:', authUser.email);
            
            set({
              isPremium: authUser.is_premium,
              subscriptionExpiresAt: authUser.subscription_expires_at || null,
              isLoading: false,
            });
            
            console.log('✅ Premium status synced from database:', authUser.is_premium ? 'Premium' : 'Free');
            return;
          }
          
          // Fallback to local storage if not authenticated
          const currentState = get();
          console.log('🔍 No authenticated user, checking local storage:', currentState.isPremium ? 'Premium' : 'Free');
          
          // Check if subscription has expired
          if (currentState.subscriptionExpiresAt) {
            const now = new Date();
            const expiresAt = new Date(currentState.subscriptionExpiresAt);
            const isExpired = expiresAt < now;
            
            if (isExpired) {
              console.log('⚠️ Subscription expired, downgrading to free');
              set({
                isPremium: false,
                subscriptionExpiresAt: null,
                isLoading: false,
              });
              return;
            }
          }
          
          set({ isLoading: false });
        } catch (error: any) {
          console.error('Error checking subscription:', error);
          set({ 
            error: error.message, 
            isLoading: false 
          });
        }
      },

        upgradeToPremium: async () => {
    set({ isLoading: true, error: null });
    try {
      console.log('🚀 Redirecting to payment system...');
      
      // In production, this would integrate with:
      // - Google Play Billing for Android
      // - App Store Connect for iOS  
      // - Stripe or other payment processor for web
      
      // Simulate checking payment system
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // This should redirect to actual payment system
      // For now, throw error to indicate payment system needed
      throw new Error('Payment system integration required. Premium access is only available through actual subscription purchase.');
      
    } catch (error: any) {
      console.error('❌ Upgrade failed:', error);
      set({ 
        error: error.message, 
        isLoading: false 
      });
      throw error;
    }
  },

      downgradToFree: () => {
        console.log('📉 Downgrading to Free tier...');
        set({
          isPremium: false,
          subscriptionExpiresAt: null,
          error: null,
        });
        console.log('✅ Downgraded to Free tier');
      },


    }),
    {
      name: 'shabari-subscription', // localStorage key
      partialize: (state) => ({ 
        isPremium: state.isPremium, 
        subscriptionExpiresAt: state.subscriptionExpiresAt 
      }),
    }
  )
);

// Sync subscription status when auth state changes
if (typeof window !== 'undefined') {
  // Set up listener for auth state changes
  setTimeout(async () => {
    try {
      const { useAuthStore } = await import('./authStore');
      useAuthStore.subscribe((state, prevState) => {
        // When user logs in or their data changes, sync premium status
        if (state.user && (state.user !== prevState.user || state.user?.is_premium !== prevState.user?.is_premium)) {
          console.log('🔄 Auth state changed, syncing premium status...');
          useSubscriptionStore.getState().checkSubscriptionStatus();
        }
        
        // When user logs out, reset to free
        if (!state.user && prevState.user) {
          console.log('👋 User logged out, resetting to free tier');
          useSubscriptionStore.setState({
            isPremium: false,
            subscriptionExpiresAt: null,
          });
        }
      });
    } catch (error) {
      console.error('Error setting up auth sync:', error);
    }
  }, 100);
}

// Make subscription functions globally available for debugging in browser console
if (typeof window !== 'undefined') {
  (window as any).ShabariSubscription = {
    checkStatus: () => {
      const state = useSubscriptionStore.getState();
      console.log('Premium Status:', state.isPremium);
      console.log('Expires At:', state.subscriptionExpiresAt);
      return state.isPremium;
    },
    syncFromDatabase: () => useSubscriptionStore.getState().checkSubscriptionStatus(),
  };
}
