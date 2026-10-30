/**
 * RENTORA WEB PLATFORM - JAVASCRIPT CONTROLLER
 * Full Firebase Auth & Firestore Real-Time Integration
 * Compatible 1:1 with Rentora Landlord Mobile App
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. FIREBASE CONFIGURATION & INITIALIZATION
  // ==========================================================================
  const firebaseConfig = {
    apiKey: "AIzaSyCw3dCHIdgOQPSJEvVX2u0oy2DZ7ZMCmec",
    authDomain: "rentora-31c64.firebaseapp.com",
    projectId: "rentora-31c64",
    storageBucket: "rentora-31c64.firebasestorage.app",
    messagingSenderId: "293604785108",
    appId: "1:293604785108:android:6bc6705b7f4035ab3eb441"
  };

  let fbApp = null;
  let fbAuth = null;
  let fbDb = null;
  let isFirebaseReady = false;

  try {
    if (typeof firebase !== 'undefined') {
      fbApp = firebase.initializeApp(firebaseConfig);
      fbAuth = firebase.auth();
      fbDb = firebase.firestore();
      isFirebaseReady = true;
      console.log('Rentora: Firebase connected successfully.');
    }
  } catch (err) {
    console.warn('Rentora: Firebase initialization notice:', err.message);
  }

  // ==========================================================================
  // 2. APPLICATION STATE
  // STRICT RULE: Authenticated user data defaults to empty [] (NO dummy data)
  // ==========================================================================
  const state = {
    theme: localStorage.getItem('rentora_theme') || 'dark',
    view: 'landing', // 'landing' | 'auth' | 'dashboard'
    authMode: 'signin', // 'signin' | 'signup'
    dashboardTab: 'overview',
    currentUser: null,
    isDemoMode: false,
    loading: false,
    unsubscribeListeners: [],

    // Live Account Data (populated strictly from Firestore when logged in)
    properties: [],
    activeProperty: null,
    units: [],
    tenants: [],
    bills: [],
    payments: [],
    settlements: [],
    settings: null,

    // Filters and Search
    billsFilter: 'all',
    billsSearch: '',

    // Temporary modal actions
    currentVacate: null,
    targetDeleteTenantId: null
  };

  // Sample data loaded ONLY if user explicitly clicks "Explore Demo Mode"
  const DEMO_FIXTURES = {
    properties: [
      {
        id: 'prop-krishna-1',
        ownerId: 'demo-user-1',
        name: 'Krishna Residency (Main Building)',
        type: 'Room',
        address: 'Sector 14, Urban Estate, Gurgaon',
        totalUnits: 6,
        defaultRent: 14000,
        electricityRate: 10,
        waterCharge: 200,
        parkingCharge: 500,
        isDeleted: false
      }
    ],
    units: [
      { id: 'u1', propertyId: 'prop-krishna-1', number: '101', floor: '1st Floor', status: 'occupied', tenant: 'Rahul Sharma', rent: 14000, meter: 'MTR-8812', currentTenantId: 't1' },
      { id: 'u2', propertyId: 'prop-krishna-1', number: '102', floor: '1st Floor', status: 'vacant', tenant: null, rent: 12500, meter: 'MTR-8813', currentTenantId: null },
      { id: 'u3', propertyId: 'prop-krishna-1', number: '201', floor: '2nd Floor', status: 'occupied', tenant: 'Amit Verma', rent: 15000, meter: 'MTR-8814', currentTenantId: 't2' },
      { id: 'u4', propertyId: 'prop-krishna-1', number: '202', floor: '2nd Floor', status: 'occupied', tenant: 'Priya Patel', rent: 13000, meter: 'MTR-8815', currentTenantId: 't3' },
      { id: 'u5', propertyId: 'prop-krishna-1', number: '301', floor: '3rd Floor', status: 'vacant', tenant: null, rent: 16000, meter: 'MTR-8816', currentTenantId: null },
      { id: 'u6', propertyId: 'prop-krishna-1', number: '302', floor: '3rd Floor', status: 'occupied', tenant: 'Suresh Kumar', rent: 14500, meter: 'MTR-8817', currentTenantId: 't4' },
    ],
    tenants: [
      { id: 't1', propertyId: 'prop-krishna-1', unitId: 'u1', unitNumber: '101', name: 'Rahul Sharma', mobile: '+91 98765 43210', rent: 14000, monthlyRent: 14000, status: 'active', moveIn: '2025-11-01', initialMeter: 420, deposit: 14000, advance: 0, gender: 'male', occupation: 'Software Engineer', totalMembers: 2, idProofType: 'aadhaar', documentNumber: '9876-5432-1098', loginStatus: 'active', loginPassword: 'Rent@Rahul1' },
      { id: 't2', propertyId: 'prop-krishna-1', unitId: 'u3', unitNumber: '201', name: 'Amit Verma', mobile: '+91 91234 56789', rent: 15000, monthlyRent: 15000, status: 'active', moveIn: '2026-01-15', initialMeter: 510, deposit: 15000, advance: 2500, gender: 'male', occupation: 'Bank Officer', totalMembers: 3, idProofType: 'pan', documentNumber: 'ABCDE1234F', loginStatus: 'active', loginPassword: 'Rent@Amit201' },
      { id: 't3', propertyId: 'prop-krishna-1', unitId: 'u4', unitNumber: '202', name: 'Priya Patel', mobile: '+91 99887 76655', rent: 13000, monthlyRent: 13000, status: 'active', moveIn: '2026-03-01', initialMeter: 380, deposit: 13000, advance: 0, gender: 'female', occupation: 'Teacher', totalMembers: 1, idProofType: 'aadhaar', documentNumber: '4455-6677-8899', loginStatus: 'active', loginPassword: 'Rent@Priya3' },
      { id: 't4', propertyId: 'prop-krishna-1', unitId: 'u6', unitNumber: '302', name: 'Suresh Kumar', mobile: '+91 97766 55443', rent: 14500, monthlyRent: 14500, status: 'active', moveIn: '2026-05-10', initialMeter: 460, deposit: 14500, advance: 0, gender: 'male', occupation: 'Architect', totalMembers: 2, idProofType: 'driving_license', documentNumber: 'DL-0420190012345', loginStatus: 'not_created', loginPassword: 'Rent@Suresh4' },
      { id: 't5', propertyId: 'prop-krishna-1', unitId: 'u2', unitNumber: '102 (Former)', name: 'Vikram Singh', mobile: '+91 98877 11223', rent: 12500, monthlyRent: 12500, status: 'vacated', moveIn: '2025-08-01', moveOut: '2026-10-15', settlementNum: 'SET-2026-0001', initialMeter: 300, finalMeter: 345, deposit: 12500, gender: 'male', occupation: 'Manager' },
      { id: 't6', propertyId: 'prop-krishna-1', unitId: 'u5', unitNumber: '301 (Former)', name: 'Deepak Joshi', mobile: '+91 94455 66778', rent: 15500, monthlyRent: 15500, status: 'vacated', moveIn: '2025-04-01', moveOut: '2026-09-30', settlementNum: 'SET-2026-0002', initialMeter: 280, finalMeter: 312, deposit: 15500, gender: 'male', occupation: 'Consultant' },
    ],
    bills: [
      {
        id: 'bill-demo-1',
        ownerId: 'demo-user-1',
        tenantId: 't1',
        tenantName: 'Rahul Sharma',
        propertyId: 'prop-krishna-1',
        propertyName: 'Krishna Residency (Main Building)',
        unitId: 'u1',
        unitNumber: '101',
        billNumber: 'INV-2026-00001',
        billingMonth: '2026-10',
        rent: 14000,
        electricityCharge: 560,
        previousMeterReading: 420,
        currentMeterReading: 476,
        electricityUnits: 56,
        electricityRate: 10,
        waterCharge: 200,
        parkingCharge: 500,
        maintenanceCharge: 0,
        otherCharges: 0,
        previousDue: 0,
        subtotal: 15260,
        totalAmount: 15260,
        paidAmount: 15260,
        remainingAmount: 0,
        paymentStatus: 'paid',
        dueDate: '2026-10-15',
        createdAt: '2026-10-01T10:00:00Z'
      },
      {
        id: 'bill-demo-2',
        ownerId: 'demo-user-1',
        tenantId: 't2',
        tenantName: 'Amit Verma',
        propertyId: 'prop-krishna-1',
        propertyName: 'Krishna Residency (Main Building)',
        unitId: 'u3',
        unitNumber: '201',
        billNumber: 'INV-2026-00002',
        billingMonth: '2026-10',
        rent: 15000,
        electricityCharge: 620,
        previousMeterReading: 510,
        currentMeterReading: 572,
        electricityUnits: 62,
        electricityRate: 10,
        waterCharge: 200,
        parkingCharge: 500,
        maintenanceCharge: 0,
        otherCharges: 0,
        previousDue: 2500,
        subtotal: 16320,
        totalAmount: 18820,
        paidAmount: 10000,
        remainingAmount: 8820,
        paymentStatus: 'partial',
        dueDate: '2026-10-18',
        createdAt: '2026-10-01T10:00:00Z'
      },
      {
        id: 'bill-demo-3',
        ownerId: 'demo-user-1',
        tenantId: 't3',
        tenantName: 'Priya Patel',
        propertyId: 'prop-krishna-1',
        propertyName: 'Krishna Residency (Main Building)',
        unitId: 'u4',
        unitNumber: '202',
        billNumber: 'INV-2026-00003',
        billingMonth: '2026-10',
        rent: 13000,
        electricityCharge: 420,
        previousMeterReading: 380,
        currentMeterReading: 422,
        electricityUnits: 42,
        electricityRate: 10,
        waterCharge: 200,
        parkingCharge: 0,
        maintenanceCharge: 0,
        otherCharges: 0,
        previousDue: 0,
        subtotal: 13620,
        totalAmount: 13620,
        paidAmount: 0,
        remainingAmount: 13620,
        paymentStatus: 'unpaid',
        dueDate: '2026-10-25',
        createdAt: '2026-10-01T10:00:00Z'
      }
    ],
    payments: [
      {
        id: 'pay-demo-1',
        ownerId: 'demo-user-1',
        billId: 'bill-demo-1',
        tenantId: 't1',
        amount: 15260,
        paymentDate: '2026-10-08',
        paymentMethod: 'upi',
        transactionId: 'UPI-4928172901',
        createdAt: '2026-10-08T12:00:00Z'
      },
      {
        id: 'pay-demo-2',
        ownerId: 'demo-user-1',
        billId: 'bill-demo-2',
        tenantId: 't2',
        amount: 10000,
        paymentDate: '2026-10-12',
        paymentMethod: 'bank_transfer',
        transactionId: 'IMPS-9901827411',
        createdAt: '2026-10-12T14:30:00Z'
      }
    ],
    settlements: [
      {
        id: 'set-1',
        settlementNumber: 'SET-2026-0001',
        tenantName: 'Vikram Singh',
        tenantMobile: '+91 98877 11223',
        unitNumber: '102',
        monthlyRent: 12500,
        periodEnd: '2026-10-10',
        moveOutDate: '2026-10-15',
        policy: 'Fixed 30 Days',
        extraDays: 5,
        dailyRate: 416.67,
        extraStayRent: 2083.35,
        elecUnits: 45,
        elecRate: 10,
        elecCharge: 450,
        totalCharges: 2533.35,
        advanceAdjusted: 0,
        depositDeducted: 12500,
        netAmount: -9966.65,
        createdAt: '2026-10-15T14:30:00Z'
      }
    ],
    settings: {
      ownerName: 'Deepak Rathore',
      businessName: 'Krishna Residency',
      phone: '+91 98765 43210',
      address: 'A-42, Malviya Nagar, Jaipur, Rajasthan 302017',
      upiId: 'rentora@upi',
      logoUrl: '',
      paymentInstructions: 'Please pay by the due date to avoid any late fees. Kindly send a payment screenshot for verification.'
    }
  };

  // ==========================================================================
  // 3. INITIALIZATION
  // ==========================================================================
  function init() {
    applyTheme(state.theme);
    setupEventListeners();
    initCalculator();
    setupFirebaseAuthListener();
    renderAllPortalData();
  }

  // ==========================================================================
  // 4. THEME & VIEW SWITCHING
  // ==========================================================================
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('rentora_theme', theme);
    
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = theme === 'dark' 
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    }
  }

  // Mobile Navigation Drawer Control (Landing Page)
  window.toggleMobileNav = function (forceState) {
    const drawer = document.getElementById('mobileNavDrawer');
    const backdrop = document.getElementById('mobileNavBackdrop');
    const btn = document.getElementById('navHamburgerBtn');
    if (!drawer) return;

    const isOpen = drawer.classList.contains('active');
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !isOpen;

    if (shouldOpen) {
      drawer.classList.add('active');
      if (backdrop) backdrop.classList.add('active');
      if (btn) btn.classList.add('active');
      document.body.classList.add('drawer-open');
    } else {
      drawer.classList.remove('active');
      if (backdrop) backdrop.classList.remove('active');
      if (btn) btn.classList.remove('active');
      document.body.classList.remove('drawer-open');
    }
  };

  // Mobile Portal Sidebar Drawer Control (Dashboard)
  window.togglePortalSidebar = function (forceState) {
    const sidebar = document.getElementById('portalSidebar');
    const backdrop = document.getElementById('portalSidebarBackdrop');
    if (!sidebar) return;

    const isOpen = sidebar.classList.contains('active');
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !isOpen;

    if (shouldOpen) {
      sidebar.classList.add('active');
      if (backdrop) backdrop.classList.add('active');
      document.body.classList.add('portal-drawer-open');
    } else {
      sidebar.classList.remove('active');
      if (backdrop) backdrop.classList.remove('active');
      document.body.classList.remove('portal-drawer-open');
    }
  };

  window.switchView = function (target) {
    state.view = target;
    const landingView = document.getElementById('landingView');
    const authView = document.getElementById('authView');
    const dashboardView = document.getElementById('dashboardView');
    const viewSwitchLanding = document.getElementById('viewSwitchLanding');
    const viewSwitchDashboard = document.getElementById('viewSwitchDashboard');

    if (typeof window.toggleMobileNav === 'function') window.toggleMobileNav(false);
    if (typeof window.togglePortalSidebar === 'function') window.togglePortalSidebar(false);

    if (landingView) landingView.style.display = 'none';
    if (authView) authView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'none';

    if (viewSwitchLanding) viewSwitchLanding.classList.remove('active');
    if (viewSwitchDashboard) viewSwitchDashboard.classList.remove('active');

    // Toggle body padding class — dashboard/auth manage their own layout
    document.body.classList.remove('view-dashboard', 'view-auth');

    if (target === 'landing') {
      if (landingView) landingView.style.display = 'block';
      if (viewSwitchLanding) viewSwitchLanding.classList.add('active');
    } else if (target === 'auth') {
      if (authView) authView.style.display = 'block';
      if (viewSwitchDashboard) viewSwitchDashboard.classList.add('active');
      document.body.classList.add('view-auth');
    } else if (target === 'dashboard') {
      if (dashboardView) dashboardView.style.display = 'block';
      if (viewSwitchDashboard) viewSwitchDashboard.classList.add('active');
      document.body.classList.add('view-dashboard');
      renderAllPortalData();
      if (typeof window.switchDashboardTab === 'function') {
        window.switchDashboardTab(state.dashboardTab || 'overview');
      }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.openAppFromLanding = function () {
    if (state.currentUser) {
      window.switchView('dashboard');
    } else {
      window.switchView('auth');
    }
  };

  window.switchDashboardTab = function (tabName) {
    state.dashboardTab = tabName;
    document.querySelectorAll('.portal-nav-item').forEach(el => el.classList.remove('active'));
    const targetNav = document.getElementById(`nav-${tabName}`);
    if (targetNav) targetNav.classList.add('active');

    // Sync Bottom Navigation Bar
    document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
    const targetBNav = document.getElementById(`bnav-${tabName}`);
    if (targetBNav) targetBNav.classList.add('active');

    // Update Mobile Portal Header Title
    const activeTabLabel = document.getElementById('portalActiveTabName');
    if (activeTabLabel) {
      const titles = {
        overview: 'Overview',
        properties: 'Properties',
        units: 'Rooms & Units',
        tenants: 'Tenants',
        bills: 'Bills & Payments',
        settlements: 'Settlements',
        settings: 'Settings'
      };
      activeTabLabel.textContent = titles[tabName] || tabName;
    }

    document.querySelectorAll('.dashboard-panel').forEach(p => p.classList.remove('active'));
    const targetPanel = document.getElementById(`panel-${tabName}`);
    if (targetPanel) targetPanel.classList.add('active');

    // Close mobile portal drawer after selection
    if (typeof window.togglePortalSidebar === 'function') {
      window.togglePortalSidebar(false);
    }

    if (tabName === 'settings' && typeof populateSettingsForm === 'function') {
      populateSettingsForm();
    }
  };

  // ==========================================================================
  // 5. AUTHENTICATION FLOW (MOBILE 1:1)
  // ==========================================================================
  window.setAuthMode = function (mode) {
    state.authMode = mode;
    const tabIn = document.getElementById('authTabSignIn');
    const tabUp = document.getElementById('authTabSignUp');
    const formIn = document.getElementById('authSignInForm');
    const formUp = document.getElementById('authSignUpForm');
    const alertBox = document.getElementById('authAlertBox');

    if (alertBox) alertBox.style.display = 'none';

    if (mode === 'signup') {
      if (tabIn) tabIn.classList.remove('active');
      if (tabUp) tabUp.classList.add('active');
      if (formIn) formIn.style.display = 'none';
      if (formUp) formUp.style.display = 'block';
    } else {
      if (tabUp) tabUp.classList.remove('active');
      if (tabIn) tabIn.classList.add('active');
      if (formUp) formUp.style.display = 'none';
      if (formIn) formIn.style.display = 'block';
    }
  };

  function showAuthAlert(msg, type = 'error') {
    const alertBox = document.getElementById('authAlertBox');
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.className = `auth-alert-box auth-alert-${type}`;
    alertBox.style.display = 'block';
  }

  function setupFirebaseAuthListener() {
    if (!isFirebaseReady || !fbAuth) return;

    fbAuth.onAuthStateChanged(async user => {
      state.currentUser = user;
      updateAuthUI(user);

      if (user) {
        state.isDemoMode = false;
        await syncFromFirestore(user.uid);
      } else {
        detachFirestoreListeners();
        if (!state.isDemoMode) {
          clearUserData();
        }
      }
    });
  }

  function updateAuthUI(user) {
    const authContainer = document.getElementById('authActionContainer');
    const userNameEl = document.getElementById('sidebarUserName');
    const userSubEl = document.getElementById('sidebarUserSub');
    const avatarEl = document.getElementById('sidebarAvatar');

    if (!authContainer) return;

    if (user) {
      const displayName = user.displayName || user.email.split('@')[0];
      if (userNameEl) userNameEl.textContent = displayName;
      if (userSubEl) userSubEl.textContent = user.email;
      if (avatarEl) avatarEl.textContent = (displayName[0] || 'U').toUpperCase();

      authContainer.innerHTML = `
        <div style="font-size: 0.78rem; color: var(--secondary); margin-bottom: 4px;">✓ Connected to Mobile Account</div>
        <button class="btn btn-secondary btn-sm" style="width: 100%; color: var(--danger);" onclick="handleSignOut()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          Sign Out
        </button>
      `;
    } else if (state.isDemoMode) {
      if (userNameEl) userNameEl.textContent = 'Deepak Sharma (Demo)';
      if (userSubEl) userSubEl.textContent = 'Sample Test Mode';
      if (avatarEl) avatarEl.textContent = 'DS';

      authContainer.innerHTML = `
        <div style="font-size: 0.75rem; color: var(--warning); margin-bottom: 4px;">⚠ Demo Sample Data</div>
        <button class="btn btn-primary btn-sm" style="width: 100%;" onclick="switchView('auth')">
          Sign In with Real Account
        </button>
      `;
    } else {
      if (userNameEl) userNameEl.textContent = 'Not Signed In';
      if (userSubEl) userSubEl.textContent = 'Login to view account';
      if (avatarEl) avatarEl.textContent = '?';

      authContainer.innerHTML = `
        <button class="btn btn-primary btn-sm" style="width: 100%;" onclick="switchView('auth')">
          Sign In to Account
        </button>
      `;
    }
  }

  // Handle Sign In / Sign Up
  window.handleAuthSubmit = async function (e, mode) {
    e.preventDefault();

    if (!isFirebaseReady || !fbAuth) {
      showAuthAlert('Firebase Auth is offline. Using local mode.', 'error');
      enterDemoMode();
      return;
    }

    if (mode === 'signin') {
      const email = document.getElementById('authLoginEmail').value.trim();
      const pass = document.getElementById('authLoginPassword').value;
      const btn = document.getElementById('authSignInBtn');

      btn.disabled = true;
      btn.innerHTML = 'Signing In...';

      try {
        clearUserData();
        const userCred = await fbAuth.signInWithEmailAndPassword(email, pass);
        showToast(`Welcome back, ${userCred.user.displayName || userCred.user.email}!`, 'success');
        window.switchView('dashboard');
      } catch (err) {
        let msg = 'Failed to sign in. Please verify your email and password.';
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
          msg = 'Incorrect email or password. Please try again.';
        } else if (err.code === 'auth/wrong-password') {
          msg = 'Incorrect password. Please try again.';
        } else if (err.code === 'auth/too-many-requests') {
          msg = 'Too many failed attempts. Please try again in a few minutes.';
        }
        showAuthAlert(msg);
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg> Sign In to Account`;
      }

    } else if (mode === 'signup') {
      const name = document.getElementById('authRegisterName').value.trim();
      const email = document.getElementById('authRegisterEmail').value.trim();
      const pass = document.getElementById('authRegisterPassword').value;
      const phone = document.getElementById('authRegisterPhone').value.trim();
      const btn = document.getElementById('authSignUpBtn');

      if (!name) {
        showAuthAlert('Please enter your full name.');
        return;
      }
      if (pass.length < 6) {
        showAuthAlert('Password must be at least 6 characters long.');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = 'Creating Account...';

      try {
        clearUserData();
        const userCred = await fbAuth.createUserWithEmailAndPassword(email, pass);
        const user = userCred.user;

        await user.updateProfile({ displayName: name });

        if (fbDb) {
          await fbDb.collection('users').doc(user.uid).set({
            uid: user.uid,
            name: name,
            email: email,
            phone: phone || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }

        showToast(`Account created successfully! Welcome to Rentora, ${name}!`, 'success');
        window.switchView('dashboard');
      } catch (err) {
        let msg = 'Failed to create account.';
        if (err.code === 'auth/email-already-in-use') {
          msg = 'This email is already registered. Please click "Sign In" instead.';
        } else if (err.code === 'auth/weak-password') {
          msg = 'Password is too weak. Please use at least 6 characters.';
        } else if (err.message) {
          msg = err.message;
        }
        showAuthAlert(msg);
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg> Create Landlord Account`;
      }
    }
  };

  // Google Sign-In
  window.handleGoogleAuth = async function () {
    if (!isFirebaseReady || !fbAuth) {
      showToast('Firebase not initialized. Entering demo mode.', 'info');
      enterDemoMode();
      return;
    }

    try {
      clearUserData();
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await fbAuth.signInWithPopup(provider);
      const user = result.user;

      if (fbDb) {
        await fbDb.collection('users').doc(user.uid).set({
          uid: user.uid,
          name: user.displayName || 'Owner',
          email: user.email || '',
          photoUrl: user.photoURL || '',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      showToast(`Logged in as ${user.displayName || user.email}!`, 'success');
      window.switchView('dashboard');
    } catch (err) {
      console.warn('Google Auth popup notice:', err);
      showAuthAlert(err.message || 'Google Sign-In was cancelled or failed.');
    }
  };

  // Demo Mode (For testing unauthenticated)
  window.enterDemoMode = function () {
    clearUserData();
    state.isDemoMode = true;
    state.currentUser = {
      uid: 'demo-user-1',
      displayName: 'Deepak Sharma (Demo)',
      email: 'deepak.landlord@rentora.in'
    };
    state.properties = [...DEMO_FIXTURES.properties];
    state.activeProperty = state.properties[0];
    state.units = [...DEMO_FIXTURES.units];
    state.tenants = [...DEMO_FIXTURES.tenants];
    state.bills = [...DEMO_FIXTURES.bills];
    state.payments = [...DEMO_FIXTURES.payments];
    state.settlements = [...DEMO_FIXTURES.settlements];
    state.settings = { ...DEMO_FIXTURES.settings };

    updateAuthUI(state.currentUser);
    showToast('Loaded Demo Sample Data (Krishna Residency)', 'info');
    window.switchView('dashboard');
  };

  // Safe Logout
  window.handleSignOut = async function () {
    if (fbAuth && fbAuth.currentUser) {
      await fbAuth.signOut();
    }
    clearUserData();
    state.currentUser = null;
    state.isDemoMode = false;
    updateAuthUI(null);
    showToast('Signed out of Rentora account.', 'info');
    window.switchView('landing');
  };

  function clearUserData() {
    detachFirestoreListeners();
    state.properties = [];
    state.activeProperty = null;
    state.units = [];
    state.tenants = [];
    state.bills = [];
    state.payments = [];
    state.settlements = [];
    state.settings = null;
    renderAllPortalData();
  }

  // ==========================================================================
  // 6. REAL-TIME FIRESTORE DATA SYNC (PHASE 2 & PHASE 5)
  // Owner-level data isolation enforced using ownerId == user.uid
  // ==========================================================================
  function detachFirestoreListeners() {
    state.unsubscribeListeners.forEach(unsub => unsub && unsub());
    state.unsubscribeListeners = [];
  }

  async function syncFromFirestore(ownerId) {
    if (!isFirebaseReady || !fbDb) return;
    detachFirestoreListeners();

    state.loading = true;
    toggleLoadingIndicator(true);

    try {
      // 1. Real-time Properties Listener
      const unsubProperties = fbDb.collection('properties')
        .where('ownerId', '==', ownerId)
        .where('isDeleted', '==', false)
        .onSnapshot(snapshot => {
          state.properties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          // Determine Active Property
          if (state.properties.length > 0) {
            if (!state.activeProperty || !state.properties.some(p => p.id === state.activeProperty.id)) {
              state.activeProperty = state.properties[0];
            } else {
              // Refresh active property data
              state.activeProperty = state.properties.find(p => p.id === state.activeProperty.id);
            }
          } else {
            state.activeProperty = null;
          }

          updatePropertyDropdown();
          renderAllPortalData();
          toggleLoadingIndicator(false);
          state.loading = false;
        }, err => {
          console.error('Properties sync error:', err);
          toggleLoadingIndicator(false);
          state.loading = false;
        });
      state.unsubscribeListeners.push(unsubProperties);

      // 2. Real-time Units Listener
      const unsubUnits = fbDb.collection('units')
        .where('ownerId', '==', ownerId)
        .onSnapshot(snapshot => {
          state.units = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              ...d,
              propertyId: d.propertyId,
              number: d.unitNumber || 'Unit',
              floor: d.floor || '1st Floor',
              status: d.status || 'vacant',
              tenant: d.tenantName || null,
              rent: d.defaultRent || 0,
              meter: d.meterNumber || 'MTR',
              currentTenantId: d.currentTenantId || null
            };
          });
          renderAllPortalData();
        }, err => console.error('Units sync error:', err));
      state.unsubscribeListeners.push(unsubUnits);

      // 3. Real-time Tenants Listener
      const unsubTenants = fbDb.collection('tenants')
        .where('ownerId', '==', ownerId)
        .onSnapshot(snapshot => {
          state.tenants = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              ...d, // Preserve all database fields!
              ownerId: d.ownerId,
              propertyId: d.propertyId,
              unitId: d.unitId,
              unitNumber: d.unitNumber || 'Unit',
              name: d.name,
              mobile: d.mobile || d.mobileNumber || '',
              rent: d.monthlyRent !== undefined ? d.monthlyRent : (d.rent || 0),
              status: d.status || 'active',
              moveIn: d.moveInDate || d.moveIn,
              moveOut: d.moveOutDate || d.moveOut || null,
              initialMeter: d.initialMeterReading !== undefined ? d.initialMeterReading : (d.initialMeter || 0),
              deposit: d.securityDeposit !== undefined ? d.securityDeposit : (d.deposit || 0),
              advance: d.advanceAmount !== undefined ? d.advanceAmount : (d.advance || 0),
              settlementNum: d.settlementNumber || d.settlementNum || null
            };
          });
          renderAllPortalData();
        }, err => console.error('Tenants sync error:', err));
      state.unsubscribeListeners.push(unsubTenants);

      // 4. Real-time Bills Listener
      const unsubBills = fbDb.collection('bills')
        .where('ownerId', '==', ownerId)
        .onSnapshot(snapshot => {
          const rawBills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          state.bills = decorateWebBills(rawBills);
          renderAllPortalData();
        }, err => console.error('Bills sync error:', err));
      state.unsubscribeListeners.push(unsubBills);

      // 5. Real-time Payments Listener
      const unsubPayments = fbDb.collection('payments')
        .where('ownerId', '==', ownerId)
        .onSnapshot(snapshot => {
          state.payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          renderAllPortalData();
        }, err => console.error('Payments sync error:', err));
      state.unsubscribeListeners.push(unsubPayments);

      // 6. Real-time Settlements Listener
      const unsubSettlements = fbDb.collection('settlements')
        .where('ownerId', '==', ownerId)
        .onSnapshot(snapshot => {
          state.settlements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          renderAllPortalData();
        }, err => console.error('Settlements sync error:', err));
      state.unsubscribeListeners.push(unsubSettlements);

      // 7. Real-time Settings Listener
      const unsubSettings = fbDb.collection('settings').doc(ownerId)
        .onSnapshot(doc => {
          if (doc.exists) {
            state.settings = { id: doc.id, ...doc.data() };
          } else {
            state.settings = null;
          }
          if (state.dashboardTab === 'settings' && typeof populateSettingsForm === 'function') {
            populateSettingsForm();
          }
        }, err => console.error('Settings sync error:', err));
      state.unsubscribeListeners.push(unsubSettings);

    } catch (err) {
      console.error('Firestore initial sync error:', err);
      toggleLoadingIndicator(false);
      state.loading = false;
    }
  }

  function toggleLoadingIndicator(isLoading) {
    const loader = document.getElementById('portalLoadingIndicator');
    if (loader) {
      loader.style.display = isLoading ? 'flex' : 'none';
    }
  }

  // ==========================================================================
  // 7. PROPERTY MANAGEMENT (PHASE 3)
  // ==========================================================================
  function updatePropertyDropdown() {
    const select = document.getElementById('propertySelectDropdown');
    if (!select) return;

    if (state.properties.length === 0) {
      select.innerHTML = `<option value="">No Properties Found</option>`;
      select.disabled = true;
      return;
    }

    select.disabled = false;
    select.innerHTML = state.properties.map(p => `
      <option value="${p.id}" ${state.activeProperty && state.activeProperty.id === p.id ? 'selected' : ''}>
        ${p.name} (${p.type || 'Property'})
      </option>
    `).join('');
  }

  window.handlePropertySwitch = function (propId) {
    const prop = state.properties.find(p => p.id === propId);
    if (prop) {
      state.activeProperty = prop;
      renderAllPortalData();
      showToast(`Switched active property to ${prop.name}`, 'info');
    }
  };

  window.openAddPropertyModal = function () {
    const form = document.getElementById('formAddProperty');
    if (form) form.reset();
    openModal('modalAddProperty');
  };

  window.handleAddProperty = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('addPropertyBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const name = document.getElementById('propName').value.trim();
    const type = document.getElementById('propType').value;
    const address = document.getElementById('propAddress').value.trim();
    const totalUnits = parseInt(document.getElementById('propTotalUnits').value) || 1;
    const defaultRent = parseFloat(document.getElementById('propDefaultRent').value) || 0;
    const electricityRate = parseFloat(document.getElementById('propElectricityRate').value) || 0;
    const waterCharge = parseFloat(document.getElementById('propWaterCharge').value) || 0;
    const parkingCharge = parseFloat(document.getElementById('propParkingCharge').value) || 0;

    const newProperty = {
      id: 'prop_' + Date.now(),
      ownerId: state.currentUser ? state.currentUser.uid : 'demo-user-1',
      name,
      type,
      address,
      totalUnits,
      defaultRent,
      electricityRate,
      waterCharge,
      parkingCharge,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (state.currentUser && isFirebaseReady && fbDb) {
      try {
        const docRef = await fbDb.collection('properties').add({
          ownerId: state.currentUser.uid,
          name,
          type,
          address,
          totalUnits,
          defaultRent,
          electricityRate,
          waterCharge,
          parkingCharge,
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        newProperty.id = docRef.id;
      } catch (err) {
        showToast(`Failed to add property: ${err.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Create Property';
        return;
      }
    } else {
      state.properties.push(newProperty);
    }

    if (!state.activeProperty) {
      state.activeProperty = newProperty;
    }

    btn.disabled = false;
    btn.textContent = 'Create Property';
    closeModal('modalAddProperty');
    updatePropertyDropdown();
    renderAllPortalData();
    showToast(`Property "${name}" created successfully!`, 'success');
  };

  window.openEditPropertyModal = function (propId) {
    const prop = state.properties.find(p => p.id === propId);
    if (!prop) return;

    document.getElementById('editPropId').value = prop.id;
    document.getElementById('editPropName').value = prop.name || '';
    document.getElementById('editPropType').value = prop.type || 'Flat';
    document.getElementById('editPropAddress').value = prop.address || '';
    document.getElementById('editPropDefaultRent').value = prop.defaultRent || 0;
    document.getElementById('editPropElectricityRate').value = prop.electricityRate || 10;
    document.getElementById('editPropWaterCharge').value = prop.waterCharge || 0;
    document.getElementById('editPropParkingCharge').value = prop.parkingCharge || 0;

    openModal('modalEditProperty');
  };

  window.handleEditProperty = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('editPropertyBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const propId = document.getElementById('editPropId').value;
    const name = document.getElementById('editPropName').value.trim();
    const type = document.getElementById('editPropType').value;
    const address = document.getElementById('editPropAddress').value.trim();
    const defaultRent = parseFloat(document.getElementById('editPropDefaultRent').value) || 0;
    const electricityRate = parseFloat(document.getElementById('editPropElectricityRate').value) || 0;
    const waterCharge = parseFloat(document.getElementById('editPropWaterCharge').value) || 0;
    const parkingCharge = parseFloat(document.getElementById('editPropParkingCharge').value) || 0;

    const updates = {
      name,
      type,
      address,
      defaultRent,
      electricityRate,
      waterCharge,
      parkingCharge,
      updatedAt: new Date().toISOString()
    };

    if (state.currentUser && isFirebaseReady && fbDb) {
      try {
        await fbDb.collection('properties').doc(propId).update(updates);
      } catch (err) {
        showToast(`Failed to update property: ${err.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Save Changes';
        return;
      }
    } else {
      const pIdx = state.properties.findIndex(p => p.id === propId);
      if (pIdx > -1) {
        state.properties[pIdx] = { ...state.properties[pIdx], ...updates };
      }
    }

    if (state.activeProperty && state.activeProperty.id === propId) {
      state.activeProperty = { ...state.activeProperty, ...updates };
    }

    btn.disabled = false;
    btn.textContent = 'Save Changes';
    closeModal('modalEditProperty');
    updatePropertyDropdown();
    renderAllPortalData();
    showToast(`Property "${name}" updated successfully!`, 'success');
  };

  // ==========================================================================
  // 8. UNIT MANAGEMENT
  // ==========================================================================
  window.openAddUnitModal = function () {
    if (!state.activeProperty) {
      showToast('Please add or select a property first!', 'error');
      openAddPropertyModal();
      return;
    }

    const titleEl = document.getElementById('unitModalPropertyName');
    if (titleEl) titleEl.textContent = state.activeProperty.name;

    const rentEl = document.getElementById('newUnitRent');
    if (rentEl) rentEl.value = state.activeProperty.defaultRent || 12000;

    document.getElementById('formAddUnit').reset();
    openModal('modalAddUnit');
  };

  window.handleAddUnit = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('addUnitBtn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    const num = document.getElementById('newUnitNumber').value.trim();
    const floor = document.getElementById('newUnitFloor').value.trim();
    const rent = parseFloat(document.getElementById('newUnitRent').value) || 0;
    const meter = document.getElementById('newUnitMeter').value.trim() || `MTR-${Math.floor(1000 + Math.random() * 9000)}`;
    const propertyId = state.activeProperty.id;

    const newUnit = {
      id: 'u_' + Date.now(),
      propertyId,
      ownerId: state.currentUser ? state.currentUser.uid : 'demo-user-1',
      number: num,
      floor,
      rent,
      meter,
      status: 'vacant',
      tenant: null,
      currentTenantId: null
    };

    if (state.currentUser && isFirebaseReady && fbDb) {
      try {
        const docRef = await fbDb.collection('units').add({
          ownerId: state.currentUser.uid,
          propertyId,
          unitNumber: num,
          floor,
          defaultRent: rent,
          meterNumber: meter,
          status: 'vacant',
          currentTenantId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        newUnit.id = docRef.id;
      } catch (err) {
        showToast(`Failed to create unit: ${err.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Create Unit';
        return;
      }
    } else {
      state.units.push(newUnit);
    }

    btn.disabled = false;
    btn.textContent = 'Create Unit';
    closeModal('modalAddUnit');
    renderAllPortalData();
    showToast(`Unit ${num} successfully created in ${state.activeProperty.name}!`, 'success');
  };

  // ==========================================================================
  // 9. TENANT MANAGEMENT (PHASE 4)
  // ==========================================================================
  // Tenant Form Interactive Helpers
  window.handleTenantOccupationChange = function (prefix, val) {
    const otherGroup = document.getElementById(prefix + 'TenantOccupationOtherGroup');
    const otherInput = document.getElementById(prefix + 'TenantOccupationOther');
    if (otherGroup) {
      if (val === 'other') {
        otherGroup.style.display = 'block';
        if (otherInput) otherInput.required = true;
      } else {
        otherGroup.style.display = 'none';
        if (otherInput) {
          otherInput.required = false;
          otherInput.value = '';
        }
      }
    }
  };

  window.handleTenantIdProofChange = function (prefix, val) {
    const docGroup = document.getElementById(prefix + 'TenantIdProofDocGroup');
    const docInput = document.getElementById(prefix + 'TenantIdProofDoc');
    if (docGroup) {
      if (val && val !== 'none') {
        docGroup.style.display = 'block';
        if (docInput) docInput.required = true;
      } else {
        docGroup.style.display = 'none';
        if (docInput) {
          docInput.required = false;
          docInput.value = '';
        }
      }
    }
  };

  window.handleTenantElecTypeChange = function (prefix, val) {
    const fixedGroup = document.getElementById(prefix + 'TenantElecFixedGroup');
    const perUnitGroup = document.getElementById(prefix + 'TenantElecPerUnitGroup');
    if (fixedGroup && perUnitGroup) {
      if (val === 'fixed') {
        fixedGroup.style.display = 'block';
        perUnitGroup.style.display = 'none';
      } else if (val === 'perUnit') {
        fixedGroup.style.display = 'none';
        perUnitGroup.style.display = 'block';
      } else {
        // none
        fixedGroup.style.display = 'none';
        perUnitGroup.style.display = 'none';
      }
    }
  };

  window.handleTenantWaterTypeChange = function (prefix, val) {
    const fixedGroup = document.getElementById(prefix + 'TenantWaterFixedGroup');
    const perUnitGroup = document.getElementById(prefix + 'TenantWaterPerUnitGroup');
    if (fixedGroup && perUnitGroup) {
      if (val === 'fixed') {
        fixedGroup.style.display = 'block';
        perUnitGroup.style.display = 'none';
      } else if (val === 'perUnit') {
        fixedGroup.style.display = 'none';
        perUnitGroup.style.display = 'block';
      } else {
        // none
        fixedGroup.style.display = 'none';
        perUnitGroup.style.display = 'none';
      }
    }
  };

  window.handleTenantAppAccessChange = function (prefix, checked) {
    const loginGroup = document.getElementById(prefix + 'TenantLoginGroup');
    const passInput = document.getElementById(prefix + 'TenantTempPassword');
    if (loginGroup) {
      loginGroup.style.display = checked ? 'block' : 'none';
      if (passInput) passInput.required = checked;
    }
  };

  window.stepTenantMembers = function (prefix, delta) {
    const input = document.getElementById(prefix + 'TenantMembers');
    const display = document.getElementById(prefix + 'TenantMembersDisplay');
    if (!input || !display) return;
    let val = parseInt(input.value, 10) || 1;
    val = Math.max(1, val + delta);
    input.value = val;
    display.textContent = val;
  };

  window.togglePasswordInputVisibility = function (inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  };

  window.openAddTenantModal = function () {
    if (state.properties.length === 0) {
      showToast('Please create a property before adding tenants!', 'error');
      openAddPropertyModal();
      return;
    }

    const form = document.getElementById('formAddTenant');
    if (form) form.reset();

    // Reset Member Stepper
    const membersInput = document.getElementById('newTenantMembers');
    const membersDisplay = document.getElementById('newTenantMembersDisplay');
    if (membersInput) membersInput.value = '1';
    if (membersDisplay) membersDisplay.textContent = '1';

    // Reset conditional displays
    handleTenantOccupationChange('new', '');
    handleTenantIdProofChange('new', 'none');
    handleTenantElecTypeChange('new', 'perUnit');
    handleTenantWaterTypeChange('new', 'none');
    handleTenantAppAccessChange('new', false);

    const propSelect = document.getElementById('newTenantProperty');
    propSelect.innerHTML = state.properties.map(p => `
      <option value="${p.id}" ${state.activeProperty && state.activeProperty.id === p.id ? 'selected' : ''}>
        ${p.name}
      </option>
    `).join('');

    const activePropId = state.activeProperty ? state.activeProperty.id : state.properties[0].id;
    window.handlePropertyChangeInTenantModal(activePropId);

    const moveInInput = document.getElementById('newTenantMoveIn');
    if (moveInInput) moveInInput.value = new Date().toISOString().split('T')[0];

    openModal('modalAddTenant');
  };

  window.handlePropertyChangeInTenantModal = function (propId) {
    const unitSelect = document.getElementById('newTenantUnit');
    const prop = state.properties.find(p => p.id === propId);
    const vacantUnits = state.units.filter(u => u.propertyId === propId && u.status === 'vacant');

    if (vacantUnits.length === 0) {
      unitSelect.innerHTML = `<option value="">No vacant units in this property</option>`;
      document.getElementById('addTenantSubmitBtn').disabled = true;
    } else {
      unitSelect.innerHTML = vacantUnits.map(u => `
        <option value="${u.id}" data-rent="${u.rent}">Unit ${u.number} (${u.floor}) - ₹${Number(u.rent || 0).toLocaleString('en-IN')}/mo</option>
      `).join('');
      document.getElementById('addTenantSubmitBtn').disabled = false;
      document.getElementById('newTenantRent').value = vacantUnits[0].rent || (prop ? prop.defaultRent : 12000);
    }

    if (prop) {
      document.getElementById('newTenantElecRate').value = prop.electricityRate || 10;
      document.getElementById('newTenantWaterFixed').value = prop.waterCharge || 200;
    }
  };

  window.handleUnitSelectInTenantForm = function (unitId) {
    const unit = state.units.find(u => u.id === unitId);
    if (unit) {
      const prop = state.properties.find(p => p.id === unit.propertyId);
      document.getElementById('newTenantRent').value = unit.rent || (prop ? prop.defaultRent : 0);
    }
  };

  window.handleAddTenant = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('addTenantSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Onboarding...';

    const name = document.getElementById('newTenantName').value.trim();
    const mobile = document.getElementById('newTenantMobile').value.trim();
    const gender = document.getElementById('newTenantGender').value || null;
    const occSelect = document.getElementById('newTenantOccupation').value;
    const customOcc = (document.getElementById('newTenantOccupationOther') ? document.getElementById('newTenantOccupationOther').value : '').trim();
    const occupation = occSelect === 'other' ? customOcc : (occSelect || null);
    const totalMembers = parseInt(document.getElementById('newTenantMembers').value, 10) || 1;
    const idProofType = document.getElementById('newTenantIdProofType').value || 'none';
    const documentNumber = idProofType !== 'none' ? (document.getElementById('newTenantIdProofDoc').value || '').trim() : null;

    const propertyId = document.getElementById('newTenantProperty').value;
    const unitId = document.getElementById('newTenantUnit').value;
    const moveIn = document.getElementById('newTenantMoveIn').value;
    const rent = parseFloat(document.getElementById('newTenantRent').value) || 0;
    const deposit = parseFloat(document.getElementById('newTenantDeposit').value) || 0;
    const advance = parseFloat(document.getElementById('newTenantAdvance').value) || 0;

    const electricityBillType = document.getElementById('newTenantElecType').value;
    const electricityFixedAmount = parseFloat(document.getElementById('newTenantElecFixed').value) || 0;
    const electricityRatePerUnit = parseFloat(document.getElementById('newTenantElecRate').value) || 0;
    const initialMeter = parseFloat(document.getElementById('newTenantMeter').value) || 0;

    const waterBillType = document.getElementById('newTenantWaterType').value;
    const waterFixedAmount = parseFloat(document.getElementById('newTenantWaterFixed').value) || 0;
    const waterRatePerUnit = parseFloat(document.getElementById('newTenantWaterRate').value) || 0;

    const createTenantLogin = document.getElementById('newTenantCreateLogin').checked;
    const temporaryPassword = (document.getElementById('newTenantTempPassword') ? document.getElementById('newTenantTempPassword').value : '').trim();

    // Mobile-app matching validations
    if (!name) {
      showToast('Tenant Full Name is required!', 'error');
      btn.disabled = false; btn.textContent = 'Confirm & Onboard Tenant'; return;
    }
    if (!propertyId) {
      showToast('Please select a property!', 'error');
      btn.disabled = false; btn.textContent = 'Confirm & Onboard Tenant'; return;
    }
    if (!unitId) {
      showToast('Please select a unit!', 'error');
      btn.disabled = false; btn.textContent = 'Confirm & Onboard Tenant'; return;
    }
    if (!moveIn) {
      showToast('Move-in date is required!', 'error');
      btn.disabled = false; btn.textContent = 'Confirm & Onboard Tenant'; return;
    }
    if (isNaN(rent) || rent < 0) {
      showToast('Monthly rent must be a positive number!', 'error');
      btn.disabled = false; btn.textContent = 'Confirm & Onboard Tenant'; return;
    }
    if (occSelect === 'other' && !customOcc) {
      showToast('Please specify the occupation!', 'error');
      btn.disabled = false; btn.textContent = 'Confirm & Onboard Tenant'; return;
    }
    if (idProofType !== 'none' && !documentNumber) {
      showToast('ID Proof Document Number is required!', 'error');
      btn.disabled = false; btn.textContent = 'Confirm & Onboard Tenant'; return;
    }
    if (createTenantLogin) {
      if (!mobile) {
        showToast('Mobile number is required to create a tenant login!', 'error');
        btn.disabled = false; btn.textContent = 'Confirm & Onboard Tenant'; return;
      }
      if (!temporaryPassword || temporaryPassword.length < 6) {
        showToast('Temporary password must be at least 6 characters long!', 'error');
        btn.disabled = false; btn.textContent = 'Confirm & Onboard Tenant'; return;
      }
    }

    const unit = state.units.find(u => u.id === unitId);
    if (!unit) {
      showToast('Selected unit does not exist!', 'error');
      btn.disabled = false; btn.textContent = 'Confirm & Onboard Tenant'; return;
    }

    const tenantPayload = {
      ownerId: state.currentUser ? state.currentUser.uid : 'demo-user-1',
      propertyId,
      unitId,
      unitNumber: unit.number,
      name,
      mobile,
      mobileNumber: mobile,
      gender: gender || undefined,
      occupation: occupation || undefined,
      totalMembers,
      idProofType,
      documentNumber,
      monthlyRent: rent,
      rent,
      moveInDate: moveIn,
      moveIn,
      initialMeterReading: initialMeter,
      initialMeter,
      securityDeposit: deposit,
      deposit,
      advanceAmount: advance,
      advance,
      electricityBillType,
      waterBillType,
      status: 'active',
      loginStatus: createTenantLogin ? 'active' : 'not_created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (electricityBillType === 'fixed') {
      tenantPayload.electricityFixedAmount = electricityFixedAmount;
    } else if (electricityBillType === 'perUnit') {
      tenantPayload.electricityRatePerUnit = electricityRatePerUnit;
      tenantPayload.initialMeterReading = initialMeter;
    }

    if (waterBillType === 'fixed') {
      tenantPayload.waterFixedAmount = waterFixedAmount;
    } else if (waterBillType === 'perUnit') {
      tenantPayload.waterRatePerUnit = waterRatePerUnit;
    }

    if (createTenantLogin) {
      tenantPayload.loginPassword = temporaryPassword;
      tenantPayload.authSecret = temporaryPassword;
      tenantPayload.isFirstLogin = true;
    }

    if (state.currentUser && isFirebaseReady && fbDb) {
      try {
        const apiKey = firebase.app().options.apiKey;
        let tenantAuthUid = null;

        // Create Tenant Auth account via Firebase REST API
        if (createTenantLogin && apiKey) {
          const cleanMobile = mobile.replace(/[^0-9]/g, '');
          const email = `${cleanMobile}@tenant.rentora.app`;
          try {
            const restResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password: temporaryPassword, returnSecureToken: true }),
            });
            const restData = await restResponse.json();
            if (!restResponse.ok) {
              const errorMsg = restData?.error?.message || 'REST API signup failed';
              if (errorMsg.includes('EMAIL_EXISTS')) {
                throw new Error(`An account for mobile number ${mobile} already exists in Firebase Auth.`);
              }
              throw new Error(errorMsg);
            }
            tenantAuthUid = restData.localId;
            tenantPayload.tenantAuthUid = tenantAuthUid;
          } catch (authErr) {
            console.error('Tenant login auth creation error:', authErr);
            showToast(`Tenant App Login Creation Failed: ${authErr.message}`, 'error');
            btn.disabled = false;
            btn.textContent = 'Confirm & Onboard Tenant';
            return;
          }
        }

        // Add tenant document
        const docRef = await fbDb.collection('tenants').add(tenantPayload);
        tenantPayload.id = docRef.id;

        // If auth user created, write users/${tenantAuthUid} document
        if (tenantAuthUid) {
          const cleanMobile = mobile.replace(/[^0-9]/g, '');
          await fbDb.collection('users').doc(tenantAuthUid).set({
            uid: tenantAuthUid,
            role: 'tenant',
            name: name.trim(),
            email: `${cleanMobile}@tenant.rentora.app`,
            phone: mobile.trim(),
            mobileNumber: mobile.trim(),
            ownerId: state.currentUser.uid,
            tenantId: tenantPayload.id,
            propertyId,
            unitId,
            isFirstLogin: true,
            loginPassword: temporaryPassword,
            authSecret: temporaryPassword,
            loginStatus: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        // Update unit status to occupied
        await fbDb.collection('units').doc(unitId).update({
          status: 'occupied',
          tenantName: name,
          currentTenantId: tenantPayload.id,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        showToast(`Failed to add tenant: ${err.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Confirm & Onboard Tenant';
        return;
      }
    } else {
      tenantPayload.id = 't_' + Date.now();
      unit.status = 'occupied';
      unit.tenant = name;
      unit.currentTenantId = tenantPayload.id;
      state.tenants.push(tenantPayload);
    }

    btn.disabled = false;
    btn.textContent = 'Confirm & Onboard Tenant';
    closeModal('modalAddTenant');
    renderAllPortalData();
    showToast(`Tenant ${name} onboarded into Unit ${unit.number}!`, 'success');
  };

  // View Tenant Details (Phase 4B - Full Comprehensive Profile)
  window.viewTenantDetails = function (tenantId) {
    const tenant = state.tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    const property = state.properties.find(p => p.id === tenant.propertyId);
    const unit = state.units.find(u => u.id === tenant.unitId || u.number === tenant.unitNumber);

    const cleanMobile = (tenant.mobile || tenant.mobileNumber || '').replace(/[^0-9]/g, '');

    // Get all bills for this tenant
    const tenantBills = state.bills.filter(b => b.tenantId === tenant.id);
    const outstandingArrears = tenantBills.filter(b => b.paymentStatus !== 'paid').reduce((sum, b) => sum + Number(b.remainingAmount || 0), 0);

    const bodyEl = document.getElementById('tenantDetailsModalBody');

    bodyEl.innerHTML = `
      <!-- Hero Header with Avatar, Status, Quick Contact -->
      <div class="detail-hero-header">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div class="detail-avatar">
            ${((tenant.name || 'T').trim().split(/\s+/).map(n => n[0]).join('').substring(0, 2)).toUpperCase()}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <h3 style="font-family: var(--font-heading); font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin: 0;">${tenant.name}</h3>
              <span class="unit-badge badge-${tenant.status}">${tenant.status}</span>
            </div>
            <div style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 4px;">
              Rent: <strong style="color: var(--primary);">₹${Number(tenant.rent || tenant.monthlyRent || 0).toLocaleString('en-IN')}/mo</strong>
              • Unit ${tenant.unitNumber || (unit ? unit.number : 'Unit')}
            </div>
          </div>
        </div>

        <div class="detail-actions-group">
          ${cleanMobile ? `
            <a href="tel:${cleanMobile}" class="btn-contact-call" title="Call Tenant">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
              Call
            </a>
            <a href="https://wa.me/91${cleanMobile.slice(-10)}" target="_blank" class="btn-contact-wa" title="WhatsApp Message">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              WhatsApp
            </a>
          ` : ''}
          <button class="btn btn-secondary btn-sm" onclick="closeModal('modalTenantDetails'); openEditTenantModal('${tenant.id}')">
            Edit
          </button>
        </div>
      </div>

      <!-- 1. Personal & Identity Proof Details -->
      <div class="detail-section-card">
        <div class="detail-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          Personal & Identity Information
        </div>
        <div class="detail-grid-3">
          <div class="detail-field-box">
            <span class="detail-field-label">Mobile Phone</span>
            <span class="detail-field-value">${tenant.mobile || tenant.mobileNumber || 'Not provided'}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Email Address</span>
            <span class="detail-field-value">${tenant.email || 'Not provided'}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Gender</span>
            <span class="detail-field-value">${tenant.gender ? (tenant.gender.charAt(0).toUpperCase() + tenant.gender.slice(1)) : 'Not specified'}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Occupation</span>
            <span class="detail-field-value">${tenant.occupation ? (tenant.occupation.charAt(0).toUpperCase() + tenant.occupation.slice(1)) : 'Not specified'}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Total Room Members</span>
            <span class="detail-field-value">${tenant.totalMembers || 1} Person(s)</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">ID Proof Type & Document #</span>
            <span class="detail-field-value">${tenant.idProofType && tenant.idProofType !== 'none' ? `${tenant.idProofType.toUpperCase()}: ${tenant.documentNumber || 'Verified'}` : 'None provided'}</span>
          </div>
        </div>
      </div>

      <!-- 2. Room Assignment & Tenancy Dates -->
      <div class="detail-section-card">
        <div class="detail-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
          Room Allocation & Tenancy Dates
        </div>
        <div class="detail-grid-3">
          <div class="detail-field-box">
            <span class="detail-field-label">Property</span>
            <span class="detail-field-value">${property ? property.name : 'Primary Property'}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Assigned Unit / Room</span>
            <span class="detail-field-value" style="color: var(--primary);">Unit ${tenant.unitNumber || (unit ? unit.number : 'Unit')} ${unit ? `(${unit.floor})` : ''}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Initial Submeter Reading</span>
            <span class="detail-field-value">${tenant.initialMeter || tenant.initialMeterReading || 0} Units</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Move-In Date</span>
            <span class="detail-field-value">${tenant.moveIn || tenant.moveInDate || 'N/A'}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Move-Out Date</span>
            <span class="detail-field-value" style="${tenant.status === 'vacated' ? 'color: var(--danger);' : ''}">${tenant.moveOut || tenant.moveOutDate || (tenant.status === 'active' ? 'Currently Active' : 'N/A')}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Tenancy Status</span>
            <span class="detail-field-value">${tenant.status === 'active' ? '<span style="color: #10B981;">Active Lease</span>' : '<span style="color: #F59E0B;">Vacated / Settled</span>'}</span>
          </div>
        </div>
      </div>

      <!-- 3. Financial Balances & Utility Rates -->
      <div class="detail-section-card">
        <div class="detail-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
          Financial Balances & Utility Configuration
        </div>
        <div class="detail-grid-4" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
          <div class="detail-field-box">
            <span class="detail-field-label">Agreed Monthly Rent</span>
            <span class="detail-field-value" style="color: var(--primary); font-size: 1.1rem;">₹${Number(tenant.rent || tenant.monthlyRent || 0).toLocaleString('en-IN')}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Security Deposit Held</span>
            <span class="detail-field-value">₹${Number(tenant.deposit || tenant.securityDeposit || 0).toLocaleString('en-IN')}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Advance Rent Balance</span>
            <span class="detail-field-value">₹${Number(tenant.advance || tenant.advanceAmount || 0).toLocaleString('en-IN')}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Outstanding Bill Dues</span>
            <span class="detail-field-value" style="color: ${outstandingArrears > 0 ? '#EF4444' : '#10B981'}; font-size: 1.1rem;">
              ₹${outstandingArrears.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div class="detail-grid-2" style="margin-top: 12px;">
          <div class="detail-field-box">
            <span class="detail-field-label">Electricity Billing Rule</span>
            <span class="detail-field-value">
              ${tenant.electricityBillType === 'fixed' ? `Fixed ₹${tenant.electricityFixedAmount || 0}/mo` : `Submeter Consumption @ ₹${tenant.electricityRatePerUnit || (property ? property.electricityRate : 10)}/unit`}
            </span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Water Billing Rule</span>
            <span class="detail-field-value">
              ${tenant.waterBillType === 'fixed' ? `Fixed ₹${tenant.waterFixedAmount || 0}/mo` : `Standard Property Charge (₹${property ? property.waterCharge || 0 : 0}/mo)`}
            </span>
          </div>
        </div>
      </div>

      <!-- 4. Tenant App Access & Password -->
      <div class="detail-section-card">
        <div class="detail-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          Rentora Tenant Mobile App Credentials
        </div>
        <div class="detail-grid-2">
          <div class="detail-field-box">
            <span class="detail-field-label">App Account Status</span>
            <span class="detail-field-value">
              ${tenant.loginStatus === 'active' ? '<span style="color: #10B981;">✓ Active App Login</span>' : tenant.loginStatus === 'disabled' ? '<span style="color: #EF4444;">Login Disabled</span>' : '<span style="color: var(--text-muted);">Not Registered Yet</span>'}
            </span>
          </div>
          <div class="detail-field-box" style="display: flex; flex-direction: row; justify-content: space-between; align-items: center;">
            <div>
              <span class="detail-field-label">Current Access Password</span>
              <span class="detail-field-value" id="tenantModalPassText" style="font-family: monospace; letter-spacing: 2px;">
                ••••••••
              </span>
            </div>
            <button type="button" class="btn btn-outline btn-sm" onclick="toggleTenantPasswordReveal('${tenant.id}')" id="tenantModalPassBtn" style="padding: 4px 10px; font-size: 0.78rem;">
              Show
            </button>
          </div>
        </div>
      </div>

      <!-- 5. Tenant Bills History -->
      <div class="detail-section-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div class="detail-section-title" style="margin-bottom: 0; padding-bottom: 0; border: none;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            Billing & Invoices History (${tenantBills.length})
          </div>
          ${tenant.status === 'active' ? `
            <button class="btn btn-secondary btn-sm" onclick="closeModal('modalTenantDetails'); openCreateBillModal('${tenant.id}')">
              + Generate Bill
            </button>
          ` : ''}
        </div>

        ${tenantBills.length === 0 ? `
          <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.88rem;">
            No bills issued for this tenant yet.
          </div>
        ` : `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.86rem; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 0.74rem; text-transform: uppercase;">
                  <th style="padding: 8px 10px;">Bill #</th>
                  <th style="padding: 8px 10px;">Month</th>
                  <th style="padding: 8px 10px;">Total</th>
                  <th style="padding: 8px 10px;">Paid</th>
                  <th style="padding: 8px 10px;">Due</th>
                  <th style="padding: 8px 10px;">Status</th>
                  <th style="padding: 8px 10px; text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${tenantBills.map(b => `
                  <tr style="border-bottom: 1px solid var(--border-subtle);">
                    <td style="padding: 8px 10px; font-family: monospace; font-weight: 700; color: var(--primary);">${b.billNumber || 'INV'}</td>
                    <td style="padding: 8px 10px;">${formatMonthReadable(b.billingMonth)}</td>
                    <td style="padding: 8px 10px; font-weight: 600;">₹${Number(b.totalAmount || 0).toLocaleString('en-IN')}</td>
                    <td style="padding: 8px 10px; color: #10B981;">₹${Number(b.paidAmount || 0).toLocaleString('en-IN')}</td>
                    <td style="padding: 8px 10px; font-weight: 700; color: ${b.remainingAmount > 0 ? '#EF4444' : 'var(--text-muted)'};">₹${Number(b.remainingAmount || 0).toLocaleString('en-IN')}</td>
                    <td style="padding: 8px 10px;">
                      <span class="unit-badge badge-${b.paymentStatus || 'unpaid'}">${b.paymentStatus || 'unpaid'}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: right;">
                      <button class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 0.78rem;" onclick="closeModal('modalTenantDetails'); openBillDetails('${b.id}')">
                        View
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <!-- Action Buttons -->
      <div style="margin-top: 24px; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
        ${tenant.status === 'active' ? `
          <button class="btn btn-primary btn-sm" onclick="closeModal('modalTenantDetails'); openCreateBillModal('${tenant.id}')">
            Create Bill
          </button>
          <button class="btn btn-emerald btn-sm" onclick="closeModal('modalTenantDetails'); openVacateModal('${tenant.id}')">
            Move-Out Vacation & Settlement
          </button>
        ` : `
          <button class="btn btn-emerald btn-sm" onclick="closeModal('modalTenantDetails'); viewSettlementInvoice('${tenant.settlementNum}')">
            View Final Settlement
          </button>
        `}
        <button class="btn btn-secondary btn-sm" onclick="closeModal('modalTenantDetails'); openEditTenantModal('${tenant.id}')">
          Edit Profile
        </button>
        <button class="btn btn-outline btn-sm" style="color: var(--danger);" onclick="closeModal('modalTenantDetails'); openDeleteTenantModal('${tenant.id}')">
          Delete Tenant
        </button>
      </div>
    `;

    openModal('modalTenantDetails');
  };

  window.toggleTenantPasswordReveal = function (tenantId) {
    const tenant = state.tenants.find(t => t.id === tenantId);
    if (!tenant) return;
    const el = document.getElementById('tenantModalPassText');
    const btn = document.getElementById('tenantModalPassBtn');
    if (!el || !btn) return;

    if (btn.textContent.trim() === 'Show') {
      el.textContent = tenant.loginPassword || tenant.authSecret || 'Rent@1234';
      el.style.letterSpacing = '0.5px';
      btn.textContent = 'Hide';
    } else {
      el.textContent = '••••••••';
      el.style.letterSpacing = '2px';
      btn.textContent = 'Show';
    }
  };

  // Helper to populate units for Edit Tenant modal (includes tenant's current unit)
  window.handlePropertyChangeInEditTenantModal = function (propId, currentTenantUnitId) {
    const unitSelect = document.getElementById('editTenantUnit');
    const eligibleUnits = state.units.filter(u => u.propertyId === propId && (u.status === 'vacant' || u.id === currentTenantUnitId));

    if (eligibleUnits.length === 0) {
      unitSelect.innerHTML = `<option value="">No eligible units in this property</option>`;
    } else {
      unitSelect.innerHTML = eligibleUnits.map(u => `
        <option value="${u.id}" ${u.id === currentTenantUnitId ? 'selected' : ''}>
          Unit ${u.number} (${u.floor}) ${u.id === currentTenantUnitId ? '— (Current Assigned)' : ''}
        </option>
      `).join('');
    }
  };

  // Edit Tenant (Phase 4C - Complete Mobile Fields)
  window.openEditTenantModal = function (tenantId) {
    const tenant = state.tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    // 1. Personal Details
    document.getElementById('editTenantId').value = tenant.id;
    document.getElementById('editTenantName').value = tenant.name || '';
    document.getElementById('editTenantMobile').value = tenant.mobile || tenant.mobileNumber || '';
    document.getElementById('editTenantGender').value = tenant.gender || '';

    // Occupation
    const occList = ['student', 'employee', 'government_employee', 'private_job', 'business', 'self_employed', 'doctor', 'engineer', 'teacher', 'shopkeeper', 'driver', 'farmer', 'homemaker'];
    if (tenant.occupation) {
      if (occList.includes(tenant.occupation)) {
        document.getElementById('editTenantOccupation').value = tenant.occupation;
        handleTenantOccupationChange('edit', tenant.occupation);
      } else {
        document.getElementById('editTenantOccupation').value = 'other';
        handleTenantOccupationChange('edit', 'other');
        const otherInp = document.getElementById('editTenantOccupationOther');
        if (otherInp) otherInp.value = tenant.occupation;
      }
    } else {
      document.getElementById('editTenantOccupation').value = '';
      handleTenantOccupationChange('edit', '');
    }

    // Members Stepper
    const members = tenant.totalMembers || 1;
    document.getElementById('editTenantMembers').value = members;
    document.getElementById('editTenantMembersDisplay').textContent = members;

    // 2. Identification
    const idType = tenant.idProofType || 'none';
    document.getElementById('editTenantIdProofType').value = idType;
    handleTenantIdProofChange('edit', idType);
    if (idType !== 'none') {
      const docInp = document.getElementById('editTenantIdProofDoc');
      if (docInp) docInp.value = tenant.documentNumber || '';
    }

    // 3. Property & Unit Assignment
    const propSelect = document.getElementById('editTenantProperty');
    propSelect.innerHTML = state.properties.map(p => `
      <option value="${p.id}" ${p.id === tenant.propertyId ? 'selected' : ''}>${p.name}</option>
    `).join('');
    handlePropertyChangeInEditTenantModal(tenant.propertyId, tenant.unitId);

    document.getElementById('editTenantMoveIn').value = tenant.moveIn || tenant.moveInDate || '';
    document.getElementById('editTenantRent').value = tenant.rent !== undefined ? tenant.rent : (tenant.monthlyRent || 0);
    document.getElementById('editTenantDeposit').value = tenant.deposit !== undefined ? tenant.deposit : (tenant.securityDeposit || 0);
    document.getElementById('editTenantAdvance').value = tenant.advance !== undefined ? tenant.advance : (tenant.advanceAmount || 0);

    // 4. Electricity Settings
    const eType = tenant.electricityBillType || 'perUnit';
    document.getElementById('editTenantElecType').value = eType;
    handleTenantElecTypeChange('edit', eType);
    document.getElementById('editTenantElecFixed').value = tenant.electricityFixedAmount || 0;
    document.getElementById('editTenantElecRate').value = tenant.electricityRatePerUnit !== undefined ? tenant.electricityRatePerUnit : 10;
    document.getElementById('editTenantMeter').value = tenant.initialMeter !== undefined ? tenant.initialMeter : (tenant.initialMeterReading || 0);

    // 5. Water Settings
    const wType = tenant.waterBillType || 'none';
    document.getElementById('editTenantWaterType').value = wType;
    handleTenantWaterTypeChange('edit', wType);
    document.getElementById('editTenantWaterFixed').value = tenant.waterFixedAmount || 0;
    document.getElementById('editTenantWaterRate').value = tenant.waterRatePerUnit || 0;

    // 6. Tenant App Access Summary
    const statusBox = document.getElementById('editTenantAppAccessSummary');
    if (statusBox) {
      const isCreated = tenant.tenantAuthUid || tenant.loginStatus === 'active';
      statusBox.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface); padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); flex-wrap: wrap; gap: 8px;">
          <div>
            <div style="font-weight: 700; color: var(--text-main);">
              Login Status: <span style="color: ${isCreated ? '#10B981' : 'var(--text-muted)'}; text-transform: uppercase;">${tenant.loginStatus || (isCreated ? 'active' : 'not_created')}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
              Tenant Mobile / User ID: <strong>${tenant.mobile || tenant.mobileNumber || 'N/A'}</strong>
            </div>
          </div>
          ${tenant.loginPassword ? `
            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: var(--text-muted);">Current Password:</div>
              <div style="font-family: monospace; font-weight: 700; color: var(--primary); font-size: 0.95rem;">${tenant.loginPassword}</div>
            </div>
          ` : `
            <div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">
              App account not configured
            </div>
          `}
        </div>
      `;
    }

    openModal('modalEditTenant');
  };

  window.handleEditTenant = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('editTenantBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const tenantId = document.getElementById('editTenantId').value;
    const name = document.getElementById('editTenantName').value.trim();
    const mobile = document.getElementById('editTenantMobile').value.trim();
    const gender = document.getElementById('editTenantGender').value || null;
    const occSelect = document.getElementById('editTenantOccupation').value;
    const customOcc = (document.getElementById('editTenantOccupationOther') ? document.getElementById('editTenantOccupationOther').value : '').trim();
    const occupation = occSelect === 'other' ? customOcc : (occSelect || null);
    const totalMembers = parseInt(document.getElementById('editTenantMembers').value, 10) || 1;
    const idProofType = document.getElementById('editTenantIdProofType').value || 'none';
    const documentNumber = idProofType !== 'none' ? (document.getElementById('editTenantIdProofDoc').value || '').trim() : null;

    const propertyId = document.getElementById('editTenantProperty').value;
    const unitId = document.getElementById('editTenantUnit').value;
    const moveInDate = document.getElementById('editTenantMoveIn').value;
    const rent = parseFloat(document.getElementById('editTenantRent').value) || 0;
    const deposit = parseFloat(document.getElementById('editTenantDeposit').value) || 0;
    const advance = parseFloat(document.getElementById('editTenantAdvance').value) || 0;

    const electricityBillType = document.getElementById('editTenantElecType').value;
    const electricityFixedAmount = parseFloat(document.getElementById('editTenantElecFixed').value) || 0;
    const electricityRatePerUnit = parseFloat(document.getElementById('editTenantElecRate').value) || 0;
    const initialMeterReading = parseFloat(document.getElementById('editTenantMeter').value) || 0;

    const waterBillType = document.getElementById('editTenantWaterType').value;
    const waterFixedAmount = parseFloat(document.getElementById('editTenantWaterFixed').value) || 0;
    const waterRatePerUnit = parseFloat(document.getElementById('editTenantWaterRate').value) || 0;

    // Validation
    if (!name) {
      showToast('Tenant Full Name is required!', 'error');
      btn.disabled = false; btn.textContent = 'Update Tenant'; return;
    }
    if (isNaN(rent) || rent < 0) {
      showToast('Monthly rent must be a positive number!', 'error');
      btn.disabled = false; btn.textContent = 'Update Tenant'; return;
    }
    if (occSelect === 'other' && !customOcc) {
      showToast('Please specify the occupation!', 'error');
      btn.disabled = false; btn.textContent = 'Update Tenant'; return;
    }
    if (idProofType !== 'none' && !documentNumber) {
      showToast('ID Proof Document Number is required!', 'error');
      btn.disabled = false; btn.textContent = 'Update Tenant'; return;
    }

    const existingTenant = state.tenants.find(t => t.id === tenantId);
    const oldUnitId = existingTenant ? existingTenant.unitId : null;
    const unit = state.units.find(u => u.id === unitId);

    const updates = {
      name,
      mobile,
      mobileNumber: mobile,
      gender: gender || undefined,
      occupation: occupation || undefined,
      totalMembers,
      idProofType,
      documentNumber,
      propertyId,
      unitId,
      unitNumber: unit ? unit.number : (existingTenant ? existingTenant.unitNumber : 'Unit'),
      moveInDate,
      monthlyRent: rent,
      rent,
      securityDeposit: deposit,
      deposit,
      advanceAmount: advance,
      advance,
      electricityBillType,
      electricityFixedAmount,
      electricityRatePerUnit,
      initialMeterReading,
      waterBillType,
      waterFixedAmount,
      waterRatePerUnit,
      updatedAt: new Date().toISOString()
    };

    if (state.currentUser && isFirebaseReady && fbDb) {
      try {
        await fbDb.collection('tenants').doc(tenantId).update(updates);

        if (oldUnitId && oldUnitId !== unitId) {
          // Vacate old unit
          await fbDb.collection('units').doc(oldUnitId).update({
            status: 'vacant',
            tenantName: null,
            currentTenantId: null,
            updatedAt: new Date().toISOString()
          });
          // Occupy new unit
          await fbDb.collection('units').doc(unitId).update({
            status: 'occupied',
            tenantName: name,
            currentTenantId: tenantId,
            updatedAt: new Date().toISOString()
          });
        } else if (unitId) {
          await fbDb.collection('units').doc(unitId).update({
            tenantName: name,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        showToast(`Failed to update tenant: ${err.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Update Tenant';
        return;
      }
    } else {
      const idx = state.tenants.findIndex(t => t.id === tenantId);
      if (idx > -1) {
        state.tenants[idx] = { ...state.tenants[idx], ...updates };
      }
      if (oldUnitId && oldUnitId !== unitId) {
        const oldU = state.units.find(u => u.id === oldUnitId);
        if (oldU) {
          oldU.status = 'vacant';
          oldU.tenant = null;
          oldU.currentTenantId = null;
        }
        if (unit) {
          unit.status = 'occupied';
          unit.tenant = name;
          unit.currentTenantId = tenantId;
        }
      }
    }

    btn.disabled = false;
    btn.textContent = 'Update Tenant';
    closeModal('modalEditTenant');
    renderAllPortalData();
    showToast(`Tenant "${name}" updated successfully!`, 'success');
  };

  // Safe Delete Tenant (Phase 4D)
  window.openDeleteTenantModal = function (tenantId) {
    const tenant = state.tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    state.targetDeleteTenantId = tenantId;
    document.getElementById('deleteTenantName').textContent = `${tenant.name} (Unit ${tenant.unitNumber})`;
    openModal('modalDeleteTenant');
  };

  window.confirmDeleteTenant = async function () {
    const tenantId = state.targetDeleteTenantId;
    if (!tenantId) return;

    const btn = document.getElementById('confirmDeleteTenantBtn');
    btn.disabled = true;
    btn.textContent = 'Deleting...';

    const tenant = state.tenants.find(t => t.id === tenantId);

    if (state.currentUser && isFirebaseReady && fbDb) {
      try {
        // 1. Reset assigned unit to vacant so new tenants can occupy it
        if (tenant && tenant.unitId) {
          await fbDb.collection('units').doc(tenant.unitId).update({
            status: 'vacant',
            tenantName: null,
            currentTenantId: null,
            updatedAt: new Date().toISOString()
          });
        }

        // 2. Remove tenant record (historical bills/payments remain preserved)
        await fbDb.collection('tenants').doc(tenantId).delete();
      } catch (err) {
        showToast(`Failed to delete tenant: ${err.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Delete Tenant';
        return;
      }
    } else {
      if (tenant && tenant.unitId) {
        const u = state.units.find(unit => unit.id === tenant.unitId);
        if (u) {
          u.status = 'vacant';
          u.tenant = null;
          u.currentTenantId = null;
        }
      }
      state.tenants = state.tenants.filter(t => t.id !== tenantId);
    }

    btn.disabled = false;
    btn.textContent = 'Delete Tenant';
    closeModal('modalDeleteTenant');
    state.targetDeleteTenantId = null;
    renderAllPortalData();
    showToast('Tenant deleted and assigned unit marked as Vacant!', 'success');
  };

  // ==========================================================================
  // 10. MOVE-OUT VACATION & SETTLEMENT FLOW (MOBILE APP 1:1)
  // ==========================================================================
  window.openVacateModal = function (tenantId) {
    const tenant = state.tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    const unit = state.units.find(u => u.id === tenant.unitId);
    state.currentVacate = { tenant, unit };

    document.getElementById('vacateTenantId').value = tenant.id;
    document.getElementById('vacateUnitId').value = tenant.unitId;
    document.getElementById('vacateTenantName').textContent = tenant.name;
    document.getElementById('vacateTenantUnitInfo').textContent = `Unit ${tenant.unitNumber} • Monthly Rent: ₹${Number(tenant.rent).toLocaleString('en-IN')}`;

    const today = new Date();
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000);
    document.getElementById('vacatePeriodEnd').value = fiveDaysAgo.toISOString().split('T')[0];
    document.getElementById('vacateMoveOutDate').value = today.toISOString().split('T')[0];

    document.getElementById('vacatePrevMeter').value = tenant.initialMeter || 450;
    document.getElementById('vacateFinalMeter').value = (tenant.initialMeter || 450) + 26;
    document.getElementById('vacateElecRate').value = 10;
    document.getElementById('vacateAdvanceAdj').value = tenant.advance || 0;
    document.getElementById('vacateDepositAdj').value = tenant.deposit || tenant.rent;

    calculateModalSettlement();
    openModal('modalVacateTenant');
  };

  window.calculateModalSettlement = function () {
    if (!state.currentVacate) return;
    const { tenant } = state.currentVacate;

    const rent = tenant.rent || 0;
    const endStr = document.getElementById('vacatePeriodEnd').value;
    const outStr = document.getElementById('vacateMoveOutDate').value;
    const policy = document.querySelector('input[name="modalPolicy"]:checked')?.value || 'fixed30';
    const prevMeter = Math.max(0, parseFloat(document.getElementById('vacatePrevMeter').value) || 0);
    const finMeter = Math.max(prevMeter, parseFloat(document.getElementById('vacateFinalMeter').value) || prevMeter);
    const rate = Math.max(0, parseFloat(document.getElementById('vacateElecRate').value) || 10);
    const advance = Math.max(0, parseFloat(document.getElementById('vacateAdvanceAdj').value) || 0);
    const deposit = Math.max(0, parseFloat(document.getElementById('vacateDepositAdj').value) || 0);

    let extraDays = 0;
    if (endStr && outStr) {
      const dEnd = new Date(endStr);
      const dOut = new Date(outStr);
      const diffMs = dOut.getTime() - dEnd.getTime();
      if (diffMs > 0) extraDays = Math.round(diffMs / 86400000);
    }

    const divisor = policy === 'fixed30' ? 30 : 31;
    const dailyRate = rent > 0 ? (rent / divisor) : 0;
    const extraRent = Math.round(dailyRate * extraDays * 100) / 100;

    const elecUnits = Math.max(0, finMeter - prevMeter);
    const elecCharge = Math.round(elecUnits * rate * 100) / 100;

    const totalCharges = Math.round((extraRent + elecCharge) * 100) / 100;
    const deductions = advance + deposit;
    const netAmount = Math.round((totalCharges - deductions) * 100) / 100;

    document.getElementById('modalExtraDaysText').textContent = `${extraDays} day(s) (₹${dailyRate.toFixed(2)}/day)`;
    document.getElementById('modalExtraRentText').textContent = `₹${extraRent.toFixed(2)}`;
    document.getElementById('modalElecChargeText').textContent = `₹${elecCharge.toFixed(2)} (${elecUnits} units)`;
    document.getElementById('modalDeductionsText').textContent = `-₹${deductions.toFixed(2)}`;

    const labelEl = document.getElementById('modalNetBalanceLabel');
    const amtEl = document.getElementById('modalNetBalanceAmount');

    if (netAmount > 0) {
      labelEl.textContent = 'AMOUNT TO COLLECT FROM TENANT:';
      labelEl.style.color = '#EF4444';
      amtEl.textContent = `₹${Math.abs(netAmount).toFixed(2)}`;
      amtEl.style.color = '#EF4444';
    } else if (netAmount < 0) {
      labelEl.textContent = 'NET REFUNDABLE TO TENANT:';
      labelEl.style.color = '#10B981';
      amtEl.textContent = `₹${Math.abs(netAmount).toFixed(2)}`;
      amtEl.style.color = '#10B981';
    } else {
      labelEl.textContent = 'BALANCE ZERO (FULLY SETTLED):';
      labelEl.style.color = '#9CA3AF';
      amtEl.textContent = `₹0.00`;
      amtEl.style.color = '#F9FAFB';
    }

    state.currentVacate.computed = {
      extraDays,
      dailyRate,
      extraRent,
      elecUnits,
      elecCharge,
      totalCharges,
      advance,
      deposit,
      netAmount,
      periodEnd: endStr,
      moveOutDate: outStr,
      policy: policy === 'fixed30' ? 'Fixed 30 Days' : 'Actual Month Days'
    };
  };

  window.handleVacateSubmit = async function (e) {
    e.preventDefault();
    if (!state.currentVacate || !state.currentVacate.computed) return;

    const { tenant, unit, computed } = state.currentVacate;
    const settlementNum = `SET-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const settlementRecord = {
      id: 'set_' + Date.now(),
      settlementNumber: settlementNum,
      tenantName: tenant.name,
      tenantMobile: tenant.mobile,
      unitNumber: tenant.unitNumber,
      monthlyRent: tenant.rent,
      periodEnd: computed.periodEnd,
      moveOutDate: computed.moveOutDate,
      policy: computed.policy,
      extraDays: computed.extraDays,
      dailyRate: computed.dailyRate,
      extraStayRent: computed.extraRent,
      elecUnits: computed.elecUnits,
      elecRate: parseFloat(document.getElementById('vacateElecRate').value) || 10,
      elecCharge: computed.elecCharge,
      totalCharges: computed.totalCharges,
      advanceAdjusted: computed.advance,
      depositDeducted: computed.deposit,
      netAmount: computed.netAmount,
      createdAt: new Date().toISOString()
    };

    tenant.status = 'vacated';
    tenant.moveOut = computed.moveOutDate;
    tenant.settlementNum = settlementNum;

    if (unit) {
      unit.status = 'vacant';
      unit.tenant = null;
      unit.currentTenantId = null;
    }

    state.settlements.unshift(settlementRecord);

    if (state.currentUser && isFirebaseReady && fbDb) {
      try {
        await fbDb.collection('settlements').add({
          ownerId: state.currentUser.uid,
          propertyId: tenant.propertyId || state.activeProperty.id,
          tenantId: tenant.id,
          unitId: tenant.unitId,
          ...settlementRecord
        });

        await fbDb.collection('tenants').doc(tenant.id).update({
          status: 'vacated',
          moveOutDate: computed.moveOutDate,
          settlementNumber: settlementNum,
          updatedAt: new Date().toISOString()
        });

        if (unit && unit.id) {
          await fbDb.collection('units').doc(unit.id).update({
            status: 'vacant',
            tenantName: null,
            currentTenantId: null,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn('Firestore vacation sync notice:', err);
      }
    }

    closeModal('modalVacateTenant');
    renderAllPortalData();
    showToast(`Unit ${tenant.unitNumber} vacated! Settlement ${settlementNum} recorded.`, 'success');
    window.viewSettlementInvoice(settlementRecord);
  };

  // ==========================================================================
  // 11. INVOICE RENDERING & SHARING
  // ==========================================================================
  window.viewSettlementInvoice = function (settlement) {
    if (typeof settlement === 'string') {
      settlement = state.settlements.find(s => s.settlementNumber === settlement) || state.settlements[0];
    }
    if (!settlement) return;

    const property = state.properties.find(p => p.id === (settlement.propertyId || (state.activeProperty ? state.activeProperty.id : '')));
    document.getElementById('invPropertyName').textContent = property ? property.name : 'Rentora Property';
    document.getElementById('invSettlementNum').textContent = settlement.settlementNumber;
    document.getElementById('invDate').textContent = `Date: ${new Date(settlement.createdAt || Date.now()).toLocaleDateString('en-IN')}`;
    document.getElementById('invTenantName').textContent = settlement.tenantName;
    document.getElementById('invTenantMobile').textContent = settlement.tenantMobile;
    document.getElementById('invUnitName').textContent = `Unit ${settlement.unitNumber}`;
    document.getElementById('invPeriodEnd').textContent = settlement.periodEnd;
    document.getElementById('invMoveOut').textContent = settlement.moveOutDate;
    document.getElementById('invPolicy').textContent = settlement.policy;

    document.getElementById('invExtraDaysMetric').textContent = `${settlement.extraDays} Days`;
    document.getElementById('invDailyRateMetric').textContent = `₹${Number(settlement.dailyRate).toFixed(2)}/day`;
    document.getElementById('invExtraRentVal').textContent = `₹${Number(settlement.extraStayRent).toFixed(2)}`;

    document.getElementById('invElecUnitsMetric').textContent = `${settlement.elecUnits} Units`;
    document.getElementById('invElecRateMetric').textContent = `₹${Number(settlement.elecRate || 10).toFixed(2)}/unit`;
    document.getElementById('invElecChargeVal').textContent = `₹${Number(settlement.elecCharge).toFixed(2)}`;

    document.getElementById('invTotalChargesVal').textContent = `₹${Number(settlement.totalCharges).toFixed(2)}`;
    document.getElementById('invAdvanceVal').textContent = `-₹${Number(settlement.advanceAdjusted).toFixed(2)}`;
    document.getElementById('invDepositVal').textContent = `-₹${Number(settlement.depositDeducted).toFixed(2)}`;

    const finalLabel = document.getElementById('invFinalLabel');
    const finalVal = document.getElementById('invNetTotalVal');

    if (settlement.netAmount > 0) {
      finalLabel.textContent = 'FINAL AMOUNT PAYABLE BY TENANT:';
      finalLabel.style.color = '#EF4444';
      finalVal.textContent = `₹${Math.abs(settlement.netAmount).toFixed(2)}`;
      finalVal.style.color = '#EF4444';
    } else {
      finalLabel.textContent = 'FINAL NET REFUNDABLE TO TENANT:';
      finalLabel.style.color = '#10B981';
      finalVal.textContent = `₹${Math.abs(settlement.netAmount).toFixed(2)}`;
      finalVal.style.color = '#10B981';
    }

    openModal('modalSettlementInvoice');
  };

  window.printInvoice = function () {
    window.print();
  };

  window.shareInvoiceWhatsApp = function () {
    const num = document.getElementById('invSettlementNum').textContent;
    const name = document.getElementById('invTenantName').textContent;
    const amt = document.getElementById('invNetTotalVal').textContent;
    const label = document.getElementById('invFinalLabel').textContent;

    const text = encodeURIComponent(`*Rentora Move-Out Settlement Receipt*\nSettlement: ${num}\nTenant: ${name}\n${label} ${amt}\nGenerated via Rentora Cloud Platform.`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  // ==========================================================================
  // 12. RENDERING DASHBOARD & EMPTY STATES (PHASE 2)
  // ==========================================================================
  function renderAllPortalData() {
    renderStats();
    renderPropertiesGrid();
    renderPortalUnits();
    renderPortalTenants(state.currentTenantTab || 'active');
    renderBillsTab();
    renderSettlementsList();
    if (state.dashboardTab === 'settings' && typeof populateSettingsForm === 'function') {
      populateSettingsForm();
    }
  }

  function renderStats() {
    const totalProps = state.properties.length;
    // Units for current active property or all properties
    const currentUnits = state.activeProperty
      ? state.units.filter(u => u.propertyId === state.activeProperty.id)
      : state.units;

    const totalUnits = currentUnits.length;
    const occupiedUnits = currentUnits.filter(u => u.status === 'occupied').length;
    const monthlyRent = currentUnits.reduce((sum, u) => sum + (u.status === 'occupied' ? u.rent : 0), 0);
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    const elProps = document.getElementById('statTotalProperties');
    const elUnits = document.getElementById('statTotalUnits');
    const elOcc = document.getElementById('statOccupiedUnits');
    const elOccRate = document.getElementById('statOccupancyRate');
    const elRent = document.getElementById('statMonthlyRent');

    if (elProps) elProps.textContent = totalProps;
    if (elUnits) elUnits.textContent = totalUnits;
    if (elOcc) elOcc.textContent = occupiedUnits;
    if (elOccRate) elOccRate.textContent = `Occupied (${occupancyRate}%)`;
    if (elRent) elRent.textContent = `₹${monthlyRent.toLocaleString('en-IN')}`;

    // Sidebar Counters
    const sideProp = document.getElementById('sidebarPropertyCount');
    const sideUnit = document.getElementById('sidebarUnitCount');
    const sideTenant = document.getElementById('sidebarTenantCount');
    const sideBill = document.getElementById('sidebarBillCount');

    if (sideProp) sideProp.textContent = totalProps;
    if (sideUnit) sideUnit.textContent = totalUnits;
    if (sideTenant) sideTenant.textContent = state.tenants.filter(t => t.status === 'active').length;
    if (sideBill) sideBill.textContent = state.bills.length;

    // Tabs Counters
    const activeCount = state.tenants.filter(t => t.status === 'active').length;
    const vacatedCount = state.tenants.filter(t => t.status === 'vacated').length;
    const elActCount = document.getElementById('activeTenantCount');
    const elVacCount = document.getElementById('vacatedTenantCount');
    if (elActCount) elActCount.textContent = activeCount;
    if (elVacCount) elVacCount.textContent = vacatedCount;
  }

  function renderPropertiesGrid() {
    const container = document.getElementById('portalPropertiesGrid');
    if (!container) return;

    if (state.properties.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path></svg>
          </div>
          <h4 class="empty-state-title">No Properties Added Yet</h4>
          <p class="empty-state-desc">Add your first property, flat, building, room or commercial office to begin managing units and rental accounting.</p>
          <button class="btn btn-primary btn-sm" onclick="openAddPropertyModal()">+ Add Your First Property</button>
        </div>
      `;
      return;
    }

    container.innerHTML = state.properties.map(p => {
      const pUnits = state.units.filter(u => u.propertyId === p.id);
      const occupied = pUnits.filter(u => u.status === 'occupied').length;
      const isSelected = state.activeProperty && state.activeProperty.id === p.id;

      return `
        <div class="property-card ${isSelected ? 'active-property' : ''}">
          <div class="property-card-header">
            <div>
              <div class="property-title">${p.name}</div>
              <div class="property-address">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                ${p.address || 'Standard Address'}
              </div>
            </div>
            <span class="unit-badge badge-occupied">${p.type || 'Flat'}</span>
          </div>

          <div class="property-meta-row">
            <div class="property-stat-pill">
              <span class="property-stat-label">Units</span>
              <span class="property-stat-val">${pUnits.length} / ${p.totalUnits || 1}</span>
            </div>
            <div class="property-stat-pill">
              <span class="property-stat-label">Occupied</span>
              <span class="property-stat-val" style="color: var(--secondary);">${occupied} Units</span>
            </div>
            <div class="property-stat-pill">
              <span class="property-stat-label">Def. Rent</span>
              <span class="property-stat-val">₹${(p.defaultRent || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; justify-content: space-between;">
            <span>Elec: ₹${p.electricityRate || 10}/unit</span>
            <span>Water: ₹${p.waterCharge || 0}/mo</span>
          </div>

          <div style="display: flex; gap: 8px; margin-top: 4px;">
            <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="handlePropertySwitch('${p.id}')">
              ${isSelected ? '✓ Active Property' : 'Select Property'}
            </button>
            <button class="btn btn-outline btn-sm" onclick="viewPropertyDetails('${p.id}')">
              View Details
            </button>
            <button class="btn btn-outline btn-sm" onclick="openEditPropertyModal('${p.id}')">
              Edit
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderPortalUnits() {
    const container1 = document.getElementById('portalUnitsGrid');
    const container2 = document.getElementById('portalUnitsFullGrid');

    const filteredUnits = state.activeProperty
      ? state.units.filter(u => u.propertyId === state.activeProperty.id)
      : state.units;

    if (!state.activeProperty || state.properties.length === 0) {
      const emptyHtml = `
        <div class="empty-state-card" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path></svg>
          </div>
          <h4 class="empty-state-title">No Properties Created Yet</h4>
          <p class="empty-state-desc">Before managing rooms or units, create your first property profile.</p>
          <button class="btn btn-primary btn-sm" onclick="openAddPropertyModal()">+ Add Property</button>
        </div>
      `;
      if (container1) container1.innerHTML = emptyHtml;
      if (container2) container2.innerHTML = emptyHtml;
      return;
    }

    if (filteredUnits.length === 0) {
      const emptyHtml = `
        <div class="empty-state-card" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
          </div>
          <h4 class="empty-state-title">No Units In ${state.activeProperty.name}</h4>
          <p class="empty-state-desc">Add units, rooms, or flats to this property to track submeter readings and onboard tenants.</p>
          <button class="btn btn-primary btn-sm" onclick="openAddUnitModal()">+ Add First Unit</button>
        </div>
      `;
      if (container1) container1.innerHTML = emptyHtml;
      if (container2) container2.innerHTML = emptyHtml;
      return;
    }

    const html = filteredUnits.map(unit => `
      <div class="unit-card">
        <div class="unit-card-header">
          <span class="unit-num">Unit ${unit.number}</span>
          <span class="unit-badge badge-${unit.status}">${unit.status}</span>
        </div>
        <div class="unit-floor-text" style="font-size: 0.82rem; color: var(--text-muted);">${unit.floor}</div>
        <div style="font-size: 1.15rem; font-weight: 700; color: var(--primary);">₹${unit.rent.toLocaleString('en-IN')}<span style="font-size: 0.78rem; font-weight: 500; color: var(--text-muted);">/mo</span></div>
        <div class="unit-tenant-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <span style="font-weight: 600; color: var(--text-main);">${unit.tenant ? unit.tenant : 'No active tenant'}</span>
        </div>
        <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
          <span>Meter: ${unit.meter}</span>
          ${unit.status === 'occupied' 
            ? `<button class="badge-vacate-action" onclick="openVacateModal('${unit.currentTenantId}')">Vacate Unit</button>` 
            : `<button class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openAddTenantModal()">Assign</button>`}
        </div>
      </div>
    `).join('');

    if (container1) container1.innerHTML = html;
    if (container2) container2.innerHTML = html;
  }

  window.filterPortalTenants = function (status) {
    document.querySelectorAll('.tenant-tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`tabBtn-${status}`);
    if (btn) btn.classList.add('active');
    renderPortalTenants(status);
  };

  function renderPortalTenants(status) {
    const container = document.getElementById('portalTenantsTableBody');
    if (!container) return;

    const filtered = state.tenants.filter(t => t.status === status);

    if (filtered.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 48px 20px;">
            <div style="color: var(--text-muted); margin-bottom: 12px;">No ${status} tenants recorded in this account yet.</div>
            ${status === 'active' ? `<button class="btn btn-primary btn-sm" onclick="openAddTenantModal()">+ Onboard New Tenant</button>` : ''}
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = filtered.map(t => {
      const prop = state.properties.find(p => p.id === t.propertyId);
      const propName = prop ? prop.name : 'Property';

      return `
        <tr style="border-bottom: 1px solid var(--border-subtle);">
          <td style="padding: 14px 16px; font-weight: 600; color: var(--text-main);">${t.name}</td>
          <td style="padding: 14px 16px; color: var(--text-secondary);">${t.mobile}</td>
          <td style="padding: 14px 16px; font-size: 0.88rem;">
            <div style="font-weight: 600; color: var(--text-main);">Unit ${t.unitNumber}</div>
            <div style="font-size: 0.76rem; color: var(--text-muted);">${propName}</div>
          </td>
          <td style="padding: 14px 16px; font-weight: 600; color: var(--primary);">₹${Number(t.rent).toLocaleString('en-IN')}</td>
          <td style="padding: 14px 16px;">
            <span class="unit-badge badge-${t.status}">${t.status}</span>
          </td>
          <td style="padding: 14px 16px; text-align: right; white-space: nowrap;">
            <button class="btn btn-secondary btn-sm" style="margin-right: 4px;" onclick="viewTenantDetails('${t.id}')">View</button>
            ${t.status === 'active' 
              ? `<button class="btn btn-secondary btn-sm" style="margin-right: 4px;" onclick="openEditTenantModal('${t.id}')">Edit</button>
                 <button class="btn btn-secondary btn-sm" style="color: var(--danger); margin-right: 4px;" onclick="openVacateModal('${t.id}')">Vacate</button>
                 <button class="btn btn-secondary btn-sm" style="color: var(--danger);" onclick="openDeleteTenantModal('${t.id}')" title="Delete record">✕</button>` 
              : `<button class="btn btn-emerald btn-sm" onclick="viewSettlementInvoice('${t.settlementNum}')">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
                   PDF
                 </button>
                 <button class="btn btn-secondary btn-sm" style="color: var(--danger); margin-left: 4px;" onclick="openDeleteTenantModal('${t.id}')" title="Delete record">✕</button>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderSettlementsList() {
    const container = document.getElementById('portalSettlementsList');
    if (!container) return;

    if (state.settlements.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
          </div>
          <h4 class="empty-state-title">No Move-Out Settlements Yet</h4>
          <p class="empty-state-desc">When a tenant moves out, finalize their settlement to automatically generate prorated statement receipts and audit records.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.settlements.map(s => `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
            <strong style="font-size: 1.05rem;">${s.tenantName}</strong>
            <span class="unit-badge badge-vacated">${s.settlementNumber}</span>
          </div>
          <div style="font-size: 0.84rem; color: var(--text-secondary);">
            Unit ${s.unitNumber} • Move-Out: ${s.moveOutDate} • Extra Stay: ${s.extraDays} days
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="text-align: right;">
            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">
              ${s.netAmount > 0 ? 'Payable by Tenant' : 'Refundable to Tenant'}
            </div>
            <div style="font-size: 1.25rem; font-weight: 800; color: ${s.netAmount > 0 ? '#EF4444' : '#10B981'};">
              ₹${Math.abs(s.netAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <button class="btn btn-secondary btn-sm" onclick="viewSettlementInvoice('${s.settlementNumber}')">
            View / Print Invoice
          </button>
        </div>
      </div>
    `).join('');
  }

  // ==========================================================================
  // DASHBOARD TAB SWITCHER
  // ==========================================================================
  window.switchDashboardTab = function (tabName) {
    state.dashboardTab = tabName;

    // 1. Update sidebar active item
    document.querySelectorAll('.portal-nav-menu .portal-nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${tabName}`);
    if (activeNav) activeNav.classList.add('active');

    // 2. Hide all panels and show target panel
    document.querySelectorAll('.dashboard-panel').forEach(p => p.classList.remove('active'));
    const targetPanel = document.getElementById(`panel-${tabName}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }

    // 3. Render data for the tab
    if (tabName === 'overview') {
      renderStats();
      renderPortalUnits();
    } else if (tabName === 'properties') {
      renderPropertiesGrid();
    } else if (tabName === 'units') {
      renderPortalUnits();
    } else if (tabName === 'tenants') {
      renderPortalTenants(state.currentTenantTab || 'active');
    } else if (tabName === 'bills') {
      renderBillsTab();
    } else if (tabName === 'settlements') {
      renderSettlementsList();
    }
  };

  // Helper: Decorate bills matching mobile app business logic
  function decorateWebBills(bills) {
    if (!Array.isArray(bills)) return [];
    return bills.map(b => {
      const subtotal = Number(b.subtotal) || ((Number(b.rent) || 0) + (Number(b.electricityCharge) || 0) + (Number(b.waterCharge) || 0) + (Number(b.parkingCharge) || 0) + (Number(b.maintenanceCharge) || 0) + (Number(b.otherCharges) || 0));
      const prevDue = Number(b.previousDue) || 0;
      const totalAmount = b.totalAmount !== undefined ? Number(b.totalAmount) : (subtotal + prevDue);
      const paidAmount = Number(b.paidAmount) || 0;
      const remainingAmount = b.remainingAmount !== undefined ? Number(b.remainingAmount) : Math.max(0, totalAmount - paidAmount);

      let status = b.paymentStatus || 'unpaid';
      if (remainingAmount <= 0 && paidAmount > 0) {
        status = 'paid';
      } else if (paidAmount > 0 && remainingAmount > 0) {
        status = 'partial';
      } else if (remainingAmount > 0 && paidAmount === 0) {
        status = 'unpaid';
      }

      return {
        ...b,
        subtotal,
        previousDue: prevDue,
        totalAmount,
        paidAmount,
        remainingAmount,
        paymentStatus: status
      };
    });
  }

  // ==========================================================================
  // PROPERTY FULL DETAILS MODAL
  // ==========================================================================
  window.viewPropertyDetails = function (propId) {
    const prop = state.properties.find(p => p.id === propId);
    if (!prop) return;

    const propUnits = state.units.filter(u => u.propertyId === prop.id);
    const occupiedUnits = propUnits.filter(u => u.status === 'occupied');
    const vacantUnits = propUnits.filter(u => u.status === 'vacant');
    const occRate = propUnits.length > 0 ? Math.round((occupiedUnits.length / propUnits.length) * 100) : 0;

    const totalPotentialRent = propUnits.reduce((sum, u) => sum + (u.rent || prop.defaultRent || 0), 0);
    const realizedRent = occupiedUnits.reduce((sum, u) => sum + (u.rent || 0), 0);

    const isSelected = state.activeProperty && state.activeProperty.id === prop.id;

    const bodyEl = document.getElementById('propertyDetailsModalBody');
    const footerEl = document.getElementById('propertyDetailsModalFooter');

    bodyEl.innerHTML = `
      <div class="detail-hero-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <h3 style="font-family: var(--font-heading); font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin: 0;">${prop.name}</h3>
            <span class="unit-badge badge-occupied">${prop.type || 'Flat'}</span>
            ${isSelected ? '<span class="unit-badge badge-active" style="background: rgba(16,185,129,0.15); color: #10B981; border: 1px solid rgba(16,185,129,0.3);">Active Property</span>' : ''}
          </div>
          <div class="property-address" style="margin-top: 6px; font-size: 0.88rem;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            ${prop.address || 'Address not provided'}
          </div>
        </div>

        <div class="detail-actions-group">
          ${!isSelected ? `
            <button class="btn btn-primary btn-sm" onclick="handlePropertySwitch('${prop.id}')">
              Set as Active
            </button>
          ` : ''}
          <button class="btn btn-secondary btn-sm" onclick="closeModal('modalPropertyDetails'); openEditPropertyModal('${prop.id}')">
            Edit Property
          </button>
        </div>
      </div>

      <!-- Occupancy & Financial Overview -->
      <div class="detail-section-card">
        <div class="detail-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
          Occupancy & Portfolio Capacity
        </div>
        <div class="detail-grid-3">
          <div class="detail-field-box">
            <span class="detail-field-label">Total Units / Rooms</span>
            <span class="detail-field-value">${propUnits.length} configured / ${prop.totalUnits || 1} capacity</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Occupied Rooms</span>
            <span class="detail-field-value" style="color: #10B981;">${occupiedUnits.length} Occupied (${occRate}%)</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Vacant Rooms</span>
            <span class="detail-field-value" style="color: #F59E0B;">${vacantUnits.length} Available</span>
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
            <span>Occupancy Rate</span>
            <span>${occRate}%</span>
          </div>
          <div class="occupancy-progress-bar">
            <div class="occupancy-progress-fill" style="width: ${occRate}%;"></div>
          </div>
        </div>

        <div class="detail-grid-2" style="margin-top: 14px;">
          <div class="detail-field-box">
            <span class="detail-field-label">Realized Monthly Rent (Occupied)</span>
            <span class="detail-field-value" style="color: var(--primary);">₹${realizedRent.toLocaleString('en-IN')}/mo</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Full Potential Rent Roll</span>
            <span class="detail-field-value">₹${totalPotentialRent.toLocaleString('en-IN')}/mo</span>
          </div>
        </div>
      </div>

      <!-- Utility & Billing Standard Charges -->
      <div class="detail-section-card">
        <div class="detail-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
          Utility & Billing Rates Configuration
        </div>
        <div class="detail-grid-4" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
          <div class="detail-field-box">
            <span class="detail-field-label">Default Rent</span>
            <span class="detail-field-value">₹${Number(prop.defaultRent || 0).toLocaleString('en-IN')}</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Electricity Rate</span>
            <span class="detail-field-value">₹${Number(prop.electricityRate || 10).toFixed(2)}/unit</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Water Charges</span>
            <span class="detail-field-value">₹${Number(prop.waterCharge || 0).toLocaleString('en-IN')}/mo</span>
          </div>
          <div class="detail-field-box">
            <span class="detail-field-label">Parking Charges</span>
            <span class="detail-field-value">₹${Number(prop.parkingCharge || 0).toLocaleString('en-IN')}/mo</span>
          </div>
        </div>
      </div>

      <!-- Units & Rooms List -->
      <div class="detail-section-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div class="detail-section-title" style="margin-bottom: 0; padding-bottom: 0; border: none;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            Rooms & Units in this Property (${propUnits.length})
          </div>
          <button class="btn btn-secondary btn-sm" onclick="closeModal('modalPropertyDetails'); openAddUnitModal()">
            + Add Unit
          </button>
        </div>

        ${propUnits.length === 0 ? `
          <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.9rem;">
            No units created for this property yet. Click "+ Add Unit" to configure rooms.
          </div>
        ` : `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 0.76rem; text-transform: uppercase;">
                  <th style="padding: 8px 10px;">Unit #</th>
                  <th style="padding: 8px 10px;">Floor</th>
                  <th style="padding: 8px 10px;">Submeter #</th>
                  <th style="padding: 8px 10px;">Rent</th>
                  <th style="padding: 8px 10px;">Status</th>
                  <th style="padding: 8px 10px;">Current Tenant</th>
                </tr>
              </thead>
              <tbody>
                ${propUnits.map(u => {
                  const tenant = state.tenants.find(t => t.id === u.currentTenantId || t.unitId === u.id);
                  const isOcc = u.status === 'occupied';
                  return `
                    <tr style="border-bottom: 1px solid var(--border-subtle);">
                      <td style="padding: 10px; font-weight: 700; color: var(--primary);">Unit ${u.number}</td>
                      <td style="padding: 10px; color: var(--text-secondary);">${u.floor || 'Standard'}</td>
                      <td style="padding: 10px; font-family: monospace; font-size: 0.82rem;">${u.meter || 'N/A'}</td>
                      <td style="padding: 10px; font-weight: 600;">₹${Number(u.rent || 0).toLocaleString('en-IN')}</td>
                      <td style="padding: 10px;">
                        <span class="unit-badge badge-${u.status}">${u.status}</span>
                      </td>
                      <td style="padding: 10px;">
                        ${isOcc && tenant ? `
                          <a href="javascript:void(0)" onclick="closeModal('modalPropertyDetails'); viewTenantDetails('${tenant.id}')" style="color: var(--primary); font-weight: 600; text-decoration: underline;">
                            ${tenant.name}
                          </a>
                        ` : isOcc ? `
                          <span style="font-weight: 600;">${u.tenant || 'Tenant'}</span>
                        ` : `
                          <span style="color: var(--text-muted); font-style: italic;">Vacant</span>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    footerEl.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="closeModal('modalPropertyDetails'); openAddTenantModal()">
        + Onboard Tenant
      </button>
      <button class="btn btn-primary btn-sm" onclick="closeModal('modalPropertyDetails'); openEditPropertyModal('${prop.id}')">
        Edit Property Settings
      </button>
      <button class="btn btn-secondary btn-sm" onclick="closeModal('modalPropertyDetails')">Close</button>
    `;

    openModal('modalPropertyDetails');
  };

  // ==========================================================================
  // BILLING FEATURE: INVOICE GENERATION & PAYMENT TRACKING
  // ==========================================================================
  function renderBillsTab() {
    let totalOutstanding = 0;
    let totalCollected = 0;
    let pendingCount = 0;
    let paidCount = 0;

    state.bills.forEach(b => {
      totalCollected += Number(b.paidAmount || 0);
      if (b.paymentStatus === 'paid') {
        paidCount++;
      } else {
        totalOutstanding += Number(b.remainingAmount || 0);
        pendingCount++;
      }
    });

    const elPendingAmt = document.getElementById('billStatPendingAmount');
    const elPaidAmt = document.getElementById('billStatPaidAmount');
    const elPendingCount = document.getElementById('billStatPendingCount');
    const elPaidCount = document.getElementById('billStatPaidCount');

    if (elPendingAmt) elPendingAmt.textContent = `₹${totalOutstanding.toLocaleString('en-IN')}`;
    if (elPaidAmt) elPaidAmt.textContent = `₹${totalCollected.toLocaleString('en-IN')}`;
    if (elPendingCount) elPendingCount.textContent = pendingCount;
    if (elPaidCount) elPaidCount.textContent = paidCount;

    // Filter counts
    const elFilterAll = document.getElementById('billFilterCountAll');
    const elFilterPending = document.getElementById('billFilterCountPending');
    const elFilterPaid = document.getElementById('billFilterCountPaid');

    if (elFilterAll) elFilterAll.textContent = state.bills.length;
    if (elFilterPending) elFilterPending.textContent = pendingCount;
    if (elFilterPaid) elFilterPaid.textContent = paidCount;

    renderBillsList();
  }

  function renderBillsList() {
    const tbody = document.getElementById('portalBillsTableBody');
    const emptyState = document.getElementById('portalBillsEmptyState');
    if (!tbody) return;

    let filtered = state.bills.filter(b => {
      if (state.billsFilter === 'pending') {
        return b.paymentStatus !== 'paid';
      }
      if (state.billsFilter === 'paid') {
        return b.paymentStatus === 'paid';
      }
      return true;
    });

    if (state.billsSearch && state.billsSearch.trim()) {
      const q = state.billsSearch.trim().toLowerCase();
      filtered = filtered.filter(b => {
        const tName = (b.tenantName || '').toLowerCase();
        const uNum = (b.unitNumber || '').toLowerCase();
        const bNum = (b.billNumber || '').toLowerCase();
        const bMonth = (b.billingMonth || '').toLowerCase();
        return tName.includes(q) || uNum.includes(q) || bNum.includes(q) || bMonth.includes(q);
      });
    }

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) {
        emptyState.style.display = 'block';
        emptyState.innerHTML = `
          <div class="empty-state-card">
            <div class="empty-state-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            </div>
            <h4 class="empty-state-title">No Bills Found</h4>
            <p class="empty-state-desc">${state.bills.length === 0 ? 'No monthly bills or invoices have been created yet. Generate a bill for an active tenant to begin tracking rent and electricity collections.' : 'No bills match the selected filter or search keyword.'}</p>
            ${state.bills.length === 0 ? `<button class="btn btn-primary btn-sm" onclick="openCreateBillModal()">+ Generate First Bill</button>` : ''}
          </div>
        `;
      }
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = filtered.map(b => {
      const prop = state.properties.find(p => p.id === b.propertyId);
      const tenant = state.tenants.find(t => t.id === b.tenantId);
      const tName = b.tenantName || (tenant ? tenant.name : 'Tenant');
      const pName = prop ? prop.name : (b.propertyName || 'Property');
      const uNum = b.unitNumber || (tenant ? tenant.unitNumber : 'Unit');

      let statusBadge = `<span class="unit-badge badge-unpaid">Unpaid</span>`;
      if (b.paymentStatus === 'paid') {
        statusBadge = `<span class="unit-badge badge-paid">Fully Paid</span>`;
      } else if (b.paymentStatus === 'partial') {
        statusBadge = `<span class="unit-badge badge-partial">Partially Paid</span>`;
      }

      return `
        <tr style="border-bottom: 1px solid var(--border-subtle); transition: background 0.2s ease;">
          <td style="padding: 14px 16px;">
            <div style="font-weight: 700; color: var(--primary); font-family: monospace; font-size: 0.95rem;">${b.billNumber || 'INV-DRAFT'}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${formatMonthReadable(b.billingMonth)}</div>
          </td>
          <td style="padding: 14px 16px;">
            <div style="font-weight: 600; color: var(--text-main);">${tName}</div>
            <div style="font-size: 0.78rem; color: var(--text-secondary);">${pName} • Unit ${uNum}</div>
          </td>
          <td style="padding: 14px 16px;">
            <div style="font-weight: 700; color: var(--text-main); font-size: 1.05rem;">₹${Number(b.totalAmount || 0).toLocaleString('en-IN')}</div>
            <div style="font-size: 0.76rem; color: var(--text-muted);">Rent: ₹${Number(b.rent || 0).toLocaleString('en-IN')} + Elec: ₹${Number(b.electricityCharge || 0)}</div>
          </td>
          <td style="padding: 14px 16px;">
            <div style="font-weight: 600; color: #10B981;">Paid: ₹${Number(b.paidAmount || 0).toLocaleString('en-IN')}</div>
            <div style="font-weight: 700; color: ${b.remainingAmount > 0 ? '#EF4444' : 'var(--text-muted)'}; font-size: 0.85rem;">
              Due: ₹${Number(b.remainingAmount || 0).toLocaleString('en-IN')}
            </div>
          </td>
          <td style="padding: 14px 16px; font-size: 0.85rem; color: var(--text-secondary);">
            ${b.dueDate || 'N/A'}
          </td>
          <td style="padding: 14px 16px;">
            ${statusBadge}
          </td>
          <td style="padding: 14px 16px; text-align: right;">
            <div style="display: inline-flex; gap: 6px; align-items: center;">
              <button class="btn btn-secondary btn-sm" onclick="openBillDetails('${b.id}')" title="View Itemized Breakdown">
                View
              </button>
              <button class="btn btn-secondary btn-sm btn-pdf" onclick="downloadBillPDF('${b.id}')" title="Download Mobile Bill PDF">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 2px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>PDF
              </button>
              ${b.remainingAmount > 0 ? `
                <button class="btn btn-emerald btn-sm" onclick="openRecordPaymentModal('${b.id}')" title="Record Payment">
                  Pay
                </button>
              ` : ''}
              <button class="btn btn-outline btn-sm" style="color: var(--danger);" onclick="deleteBill('${b.id}')" title="Delete Bill">
                &times;
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.filterBills = function (filter) {
    state.billsFilter = filter;
    document.querySelectorAll('.bill-filter-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`filterBill-${filter}`);
    if (activeBtn) activeBtn.classList.add('active');
    renderBillsList();
  };

  window.handleBillSearch = function (q) {
    state.billsSearch = q;
    renderBillsList();
  };

  function formatMonthReadable(mStr) {
    if (!mStr) return 'Current Month';
    try {
      const parts = mStr.split('-');
      if (parts.length === 2) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
        return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      }
    } catch (e) {}
    return mStr;
  }

  window.openCreateBillModal = function (preselectedTenantId) {
    if (state.properties.length === 0) {
      showToast('Please add a property before creating bills!', 'error');
      openAddPropertyModal();
      return;
    }

    const propSelect = document.getElementById('billPropertySelect');
    propSelect.innerHTML = state.properties.map(p => `
      <option value="${p.id}" ${state.activeProperty && state.activeProperty.id === p.id ? 'selected' : ''}>
        ${p.name}
      </option>
    `).join('');

    const now = new Date();
    const currMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('billMonth').value = currMonth;

    const tenDays = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    document.getElementById('billDueDate').value = tenDays.toISOString().split('T')[0];

    const activePropId = state.activeProperty ? state.activeProperty.id : state.properties[0].id;
    window.handleBillPropertyChange(activePropId, preselectedTenantId);

    openModal('modalCreateBill');
  };

  window.handleBillPropertyChange = function (propId, preselectedTenantId) {
    const prop = state.properties.find(p => p.id === propId);
    const unitSelect = document.getElementById('billUnitSelect');

    const occupiedUnits = state.units.filter(u => u.propertyId === propId && u.status === 'occupied');

    if (occupiedUnits.length === 0) {
      unitSelect.innerHTML = `<option value="">No occupied units with active tenants</option>`;
      document.getElementById('createBillSubmitBtn').disabled = true;
      return;
    }

    document.getElementById('createBillSubmitBtn').disabled = false;
    unitSelect.innerHTML = occupiedUnits.map(u => {
      const tenant = state.tenants.find(t => t.id === u.currentTenantId || t.unitId === u.id);
      const tName = tenant ? tenant.name : (u.tenant || 'Tenant');
      return `
        <option value="${u.id}" data-tenant-id="${tenant ? tenant.id : ''}">
          Unit ${u.number} (${tName})
        </option>
      `;
    }).join('');

    if (preselectedTenantId) {
      const matchUnit = occupiedUnits.find(u => {
        const t = state.tenants.find(ten => ten.id === preselectedTenantId);
        return t && (t.unitId === u.id || u.currentTenantId === t.id);
      });
      if (matchUnit) unitSelect.value = matchUnit.id;
    }

    window.handleBillUnitChange(unitSelect.value);
  };

  window.handleBillUnitChange = function (unitId) {
    const unit = state.units.find(u => u.id === unitId);
    if (!unit) return;

    const tenant = state.tenants.find(t => t.id === unit.currentTenantId || t.unitId === unit.id);
    const prop = state.properties.find(p => p.id === unit.propertyId);

    let prevReading = tenant ? Number(tenant.initialMeter || tenant.initialMeterReading || 0) : 0;
    const unitBills = state.bills.filter(b => b.unitId === unitId && b.tenantId === (tenant ? tenant.id : ''));
    if (unitBills.length > 0) {
      const sortedBills = [...unitBills].sort((a, b) => (b.billingMonth || '').localeCompare(a.billingMonth || ''));
      if (sortedBills[0].currentMeterReading) {
        prevReading = Number(sortedBills[0].currentMeterReading);
      }
    }

    document.getElementById('billPrevReading').value = prevReading;
    document.getElementById('billCurrReading').value = prevReading;

    const elecRate = (tenant && tenant.electricityRatePerUnit) || (prop && prop.electricityRate) || 10;
    document.getElementById('billElecRate').value = elecRate;

    const rent = (tenant && tenant.rent) || (tenant && tenant.monthlyRent) || unit.rent || (prop && prop.defaultRent) || 12000;
    document.getElementById('billRent').value = rent;

    const water = (tenant && tenant.waterFixedAmount) || (prop && prop.waterCharge) || 0;
    document.getElementById('billWater').value = water;

    const parking = (prop && prop.parkingCharge) || 0;
    document.getElementById('billParking').value = parking;

    document.getElementById('billMaintenance').value = 0;

    let prevDue = 0;
    if (tenant) {
      const prevUnpaid = state.bills.filter(b => b.tenantId === tenant.id && b.paymentStatus !== 'paid');
      prevDue = prevUnpaid.reduce((sum, b) => sum + Number(b.remainingAmount || 0), 0);
    }
    document.getElementById('billPrevDue').value = prevDue;

    calculateLiveBill();
  };

  window.calculateLiveBill = function () {
    const prev = parseFloat(document.getElementById('billPrevReading').value) || 0;
    const curr = parseFloat(document.getElementById('billCurrReading').value) || 0;
    const rate = parseFloat(document.getElementById('billElecRate').value) || 0;

    const unitsConsumed = Math.max(0, curr - prev);
    const elecCharge = unitsConsumed * rate;

    const rent = parseFloat(document.getElementById('billRent').value) || 0;
    const water = parseFloat(document.getElementById('billWater').value) || 0;
    const parking = parseFloat(document.getElementById('billParking').value) || 0;
    const maint = parseFloat(document.getElementById('billMaintenance').value) || 0;
    const prevDue = parseFloat(document.getElementById('billPrevDue').value) || 0;

    const subtotal = rent + elecCharge + water + parking + maint;
    const total = subtotal + prevDue;

    document.getElementById('billElecPreviewText').textContent = `Units Consumed: ${unitsConsumed} • Electricity Total: ₹${elecCharge.toFixed(2)}`;
    document.getElementById('billLiveSubtotal').textContent = `₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('billLiveTotal').textContent = `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  window.handleCreateBill = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('createBillSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    const propId = document.getElementById('billPropertySelect').value;
    const unitId = document.getElementById('billUnitSelect').value;
    const billingMonth = document.getElementById('billMonth').value;
    const dueDate = document.getElementById('billDueDate').value;

    const prevReading = parseFloat(document.getElementById('billPrevReading').value) || 0;
    const currReading = parseFloat(document.getElementById('billCurrReading').value) || 0;
    const elecRate = parseFloat(document.getElementById('billElecRate').value) || 0;
    const unitsConsumed = Math.max(0, currReading - prevReading);
    const elecCharge = unitsConsumed * elecRate;

    const rent = parseFloat(document.getElementById('billRent').value) || 0;
    const water = parseFloat(document.getElementById('billWater').value) || 0;
    const parking = parseFloat(document.getElementById('billParking').value) || 0;
    const maint = parseFloat(document.getElementById('billMaintenance').value) || 0;
    const prevDue = parseFloat(document.getElementById('billPrevDue').value) || 0;

    const subtotal = rent + elecCharge + water + parking + maint;
    const totalAmount = subtotal + prevDue;

    const unit = state.units.find(u => u.id === unitId);
    const tenant = state.tenants.find(t => t.id === unit.currentTenantId || t.unitId === unit.id);
    const prop = state.properties.find(p => p.id === propId);

    const year = new Date().getFullYear();
    const seq = state.bills.length + 1;
    const billNumber = `INV-${year}-${String(seq).padStart(5, '0')}`;

    const billData = {
      ownerId: state.currentUser ? state.currentUser.uid : 'demo-user-1',
      tenantId: tenant ? tenant.id : '',
      tenantName: tenant ? tenant.name : 'Tenant',
      propertyId: propId,
      propertyName: prop ? prop.name : 'Property',
      unitId,
      unitNumber: unit ? unit.number : 'Unit',
      billNumber,
      billingMonth,
      dueDate,
      previousMeterReading: prevReading,
      currentMeterReading: currReading,
      electricityUnits: unitsConsumed,
      electricityRate: elecRate,
      electricityCharge: elecCharge,
      rent,
      waterCharge: water,
      parkingCharge: parking,
      maintenanceCharge: maint,
      otherCharges: 0,
      previousDue: prevDue,
      subtotal,
      totalAmount,
      paidAmount: 0,
      totalPaymentAllocated: 0,
      remainingAmount: totalAmount,
      paymentStatus: 'unpaid',
      previousDuePaid: 0,
      previousDueRemaining: prevDue,
      currentBillPaid: 0,
      currentBillRemaining: subtotal,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (state.currentUser && isFirebaseReady && fbDb) {
      try {
        const docRef = await fbDb.collection('bills').add(billData);
        billData.id = docRef.id;
      } catch (err) {
        showToast(`Failed to create bill: ${err.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Generate & Save Bill';
        return;
      }
    } else {
      billData.id = 'bill_' + Date.now();
      state.bills.unshift(billData);
    }

    btn.disabled = false;
    btn.textContent = 'Generate & Save Bill';
    closeModal('modalCreateBill');
    renderBillsTab();
    showToast(`Bill ${billNumber} generated successfully!`, 'success');
  };

  window.openBillDetails = function (billId) {
    const bill = state.bills.find(b => b.id === billId);
    if (!bill) return;

    const prop = state.properties.find(p => p.id === bill.propertyId);
    const tenant = state.tenants.find(t => t.id === bill.tenantId);

    const bodyEl = document.getElementById('billDetailsModalBody');
    const footerEl = document.getElementById('billDetailsModalFooter');

    let statusBadge = `<span class="unit-badge badge-unpaid">Unpaid</span>`;
    if (bill.paymentStatus === 'paid') {
      statusBadge = `<span class="unit-badge badge-paid">Fully Paid</span>`;
    } else if (bill.paymentStatus === 'partial') {
      statusBadge = `<span class="unit-badge badge-partial">Partially Paid</span>`;
    }

    const billPayments = state.payments.filter(p => p.billId === bill.id);

    bodyEl.innerHTML = `
      <div style="background: var(--bg-surface-elevated); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <div style="font-family: monospace; font-size: 1.25rem; font-weight: 800; color: var(--primary);">${bill.billNumber || 'INV'}</div>
          <div style="font-size: 0.92rem; color: var(--text-main); font-weight: 600; margin-top: 2px;">
            ${bill.tenantName || (tenant ? tenant.name : 'Tenant')} • Unit ${bill.unitNumber || (tenant ? tenant.unitNumber : '')}
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${prop ? prop.name : (bill.propertyName || 'Property')} • ${formatMonthReadable(bill.billingMonth)}</div>
        </div>
        <div style="text-align: right;">
          ${statusBadge}
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 6px;">Due: <strong>${bill.dueDate || 'N/A'}</strong></div>
        </div>
      </div>

      <div class="table-responsive-wrapper" style="margin-bottom: 20px; border: none; background: transparent;">
      <table class="invoice-table" style="width: 100%; min-width: 520px; border-collapse: collapse; margin-bottom: 0;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border-subtle); background: var(--bg-surface-elevated); font-size: 0.82rem; text-transform: uppercase;">
            <th style="padding: 10px 12px; text-align: left;">Particulars</th>
            <th style="padding: 10px 12px; text-align: center;">Consumption / Rate</th>
            <th style="padding: 10px 12px; text-align: right;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody style="font-size: 0.9rem;">
          <tr style="border-bottom: 1px solid var(--border-subtle);">
            <td style="padding: 10px 12px; font-weight: 600;">Monthly Base Rent</td>
            <td style="padding: 10px 12px; text-align: center; color: var(--text-muted);">Standard Monthly</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 600;">₹${Number(bill.rent || 0).toFixed(2)}</td>
          </tr>
          <tr style="border-bottom: 1px solid var(--border-subtle);">
            <td style="padding: 10px 12px; font-weight: 600;">
              Electricity Charges
              <div style="font-size: 0.76rem; color: var(--text-muted);">MTR: ${bill.previousMeterReading || 0} → ${bill.currentMeterReading || 0}</div>
            </td>
            <td style="padding: 10px 12px; text-align: center; color: var(--text-muted);">
              ${bill.electricityUnits || 0} units @ ₹${bill.electricityRate || 10}/unit
            </td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 600;">₹${Number(bill.electricityCharge || 0).toFixed(2)}</td>
          </tr>
          ${bill.waterCharge > 0 ? `
            <tr style="border-bottom: 1px solid var(--border-subtle);">
              <td style="padding: 10px 12px; font-weight: 600;">Water Charges</td>
              <td style="padding: 10px 12px; text-align: center; color: var(--text-muted);">Fixed Monthly</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: 600;">₹${Number(bill.waterCharge).toFixed(2)}</td>
            </tr>
          ` : ''}
          ${bill.parkingCharge > 0 ? `
            <tr style="border-bottom: 1px solid var(--border-subtle);">
              <td style="padding: 10px 12px; font-weight: 600;">Parking Space Fee</td>
              <td style="padding: 10px 12px; text-align: center; color: var(--text-muted);">Monthly Allocated</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: 600;">₹${Number(bill.parkingCharge).toFixed(2)}</td>
            </tr>
          ` : ''}
          ${bill.maintenanceCharge > 0 ? `
            <tr style="border-bottom: 1px solid var(--border-subtle);">
              <td style="padding: 10px 12px; font-weight: 600;">Maintenance & Other Charges</td>
              <td style="padding: 10px 12px; text-align: center; color: var(--text-muted);">-</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: 600;">₹${Number(bill.maintenanceCharge).toFixed(2)}</td>
            </tr>
          ` : ''}
          <tr style="border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface-elevated);">
            <td colspan="2" style="padding: 10px 12px; font-weight: 700;">Subtotal (Current Month Charges)</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700;">₹${Number(bill.subtotal || 0).toFixed(2)}</td>
          </tr>
          ${bill.previousDue > 0 ? `
            <tr style="border-bottom: 1px solid var(--border-subtle); color: #EF4444;">
              <td colspan="2" style="padding: 10px 12px; font-weight: 600;">Previous Unpaid Arrears Carried Forward</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: 700;">+₹${Number(bill.previousDue).toFixed(2)}</td>
            </tr>
          ` : ''}
          <tr style="border-top: 2px solid var(--primary); background: var(--bg-surface-elevated); font-size: 1.05rem;">
            <td colspan="2" style="padding: 12px; font-weight: 800;">TOTAL PAYABLE INVOICE AMOUNT</td>
            <td style="padding: 12px; text-align: right; font-weight: 800; color: var(--primary);">₹${Number(bill.totalAmount || 0).toFixed(2)}</td>
          </tr>
          <tr style="color: #10B981;">
            <td colspan="2" style="padding: 8px 12px; font-weight: 600;">Total Payments Recorded</td>
            <td style="padding: 8px 12px; text-align: right; font-weight: 700;">-₹${Number(bill.paidAmount || 0).toFixed(2)}</td>
          </tr>
          <tr style="background: var(--bg-surface-elevated); font-size: 1.15rem; color: ${bill.remainingAmount > 0 ? '#EF4444' : '#10B981'};">
            <td colspan="2" style="padding: 12px; font-weight: 800;">REMAINING BALANCE DUE:</td>
            <td style="padding: 12px; text-align: right; font-weight: 800;">₹${Number(bill.remainingAmount || 0).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      </div>

      ${billPayments.length > 0 ? `
        <div style="margin-top: 16px;">
          <div style="font-weight: 700; font-size: 0.92rem; margin-bottom: 8px;">Payment Collection History</div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${billPayments.map(p => `
              <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface-elevated); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 0.88rem;">
                <div>
                  <span style="font-weight: 700; color: #10B981;">₹${Number(p.amount).toLocaleString('en-IN')}</span>
                  <span style="color: var(--text-muted); font-size: 0.8rem; margin-left: 8px;">via ${(p.paymentMethod || 'upi').toUpperCase()}</span>
                </div>
                <div style="color: var(--text-secondary); font-size: 0.8rem;">
                  ${p.paymentDate || new Date(p.createdAt || Date.now()).toLocaleDateString('en-IN')}
                  ${p.transactionId ? `• <span style="font-family: monospace;">${p.transactionId}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    footerEl.innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="downloadBillPDF('${bill.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>Download PDF
      </button>
      <button class="btn btn-outline btn-sm" onclick="printBillPDF('${bill.id}')">
        Print Invoice
      </button>
      ${bill.remainingAmount > 0 ? `
        <button class="btn btn-emerald btn-sm" onclick="closeModal('modalBillDetails'); openRecordPaymentModal('${bill.id}')">
          Record Payment
        </button>
      ` : ''}
      <button class="btn btn-secondary btn-sm" onclick="shareBillWhatsApp('${bill.id}')">
        Share WhatsApp
      </button>
      <button class="btn btn-secondary btn-sm" onclick="closeModal('modalBillDetails')">Close</button>
    `;

    openModal('modalBillDetails');
  };

  window.shareBillWhatsApp = function (billId) {
    const bill = state.bills.find(b => b.id === billId);
    if (!bill) return;
    const text = encodeURIComponent(`*Rentora Rent Bill*\nBill #: ${bill.billNumber}\nMonth: ${formatMonthReadable(bill.billingMonth)}\nTotal Amount: ₹${bill.totalAmount}\nPaid: ₹${bill.paidAmount}\nDue Balance: ₹${bill.remainingAmount}\nDue Date: ${bill.dueDate}\nStatus: ${(bill.paymentStatus || '').toUpperCase()}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  // ==========================================================================
  // 13.5 MOBILE-MATCHED BILL PDF GENERATOR & EXPORTER
  // Strictly mirrors Rentora Landload mobile app layout, typography, calculations & styling
  // Source of truth: Rentora Landload/services/pdfService.ts (lines 265-1005)
  // Strict Read-Only: NEVER mutates bill, payment, or tenant records
  // ==========================================================================
  function sanitizeForFilename(str, fallback = '') {
    if (!str || typeof str !== 'string') return fallback;
    const cleaned = str
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[/\\?%*:|"<>]/g, '')
      .replace(/[^a-zA-Z0-9_\-]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return cleaned || fallback;
  }

  function getBillPDFFilename(tenantName, invoiceNumber) {
    const cleanTenant = sanitizeForFilename(tenantName, 'Unknown_Tenant');
    const cleanInvoice = sanitizeForFilename(invoiceNumber, 'INV');
    return `Rentora_Bill_${cleanTenant}_${cleanInvoice}.pdf`;
  }

  function formatShortBillDate(value) {
    if (value === null || value === undefined) return 'N/A';
    let date = null;
    if (value instanceof Date) {
      date = value;
    } else if (value && typeof value === 'object') {
      if (typeof value.toDate === 'function') {
        date = value.toDate();
      } else if (typeof value.seconds === 'number') {
        date = new Date(value.seconds * 1000);
      }
    } else if (typeof value === 'number') {
      date = new Date(value);
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return 'N/A';
      if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(trimmed)) return trimmed;
      date = new Date(trimmed);
    }
    if (date && !isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    }
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'N/A';
  }

  function formatFullBillDate(value) {
    if (value === null || value === undefined) return 'N/A';
    let date = null;
    if (value instanceof Date) {
      date = value;
    } else if (value && typeof value === 'object') {
      if (typeof value.toDate === 'function') {
        date = value.toDate();
      } else if (typeof value.seconds === 'number') {
        date = new Date(value.seconds * 1000);
      }
    } else if (typeof value === 'number') {
      date = new Date(value);
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return 'N/A';
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const lower = trimmed.toLowerCase();
      if (months.some(m => lower.includes(m))) return trimmed;
      date = new Date(trimmed);
    }
    if (date && !isNaN(date.getTime())) {
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'N/A';
  }

  function calculateMeterDays(startVal, endVal) {
    if (!startVal || !endVal) return null;
    try {
      const parseSafe = (v) => {
        if (!v) return null;
        if (v instanceof Date) return v;
        if (v && typeof v.toDate === 'function') return v.toDate();
        if (v && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      };
      const start = parseSafe(startVal);
      const end = parseSafe(endVal);
      if (!start || !end) return null;
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 ? diffDays : null;
    } catch (e) {
      return null;
    }
  }

  function formatPaymentMonthYear(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return { monthKey: '', monthLabel: '' };
    try {
      const trimmed = dateStr.trim();
      const isoMatch = trimmed.match(/^(\d{4})-(\d{2})/);
      if (isoMatch) {
        const year = parseInt(isoMatch[1], 10);
        const monthIdx = parseInt(isoMatch[2], 10) - 1;
        const d = new Date(year, monthIdx, 1);
        return {
          monthKey: `${isoMatch[1]}-${isoMatch[2]}`,
          monthLabel: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        };
      }
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return {
          monthKey,
          monthLabel: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        };
      }
    } catch (e) {}
    return { monthKey: String(dateStr), monthLabel: String(dateStr) };
  }

  function buildMobileBillPdfData(bill, tenant, property, unit, settings, passedPayments) {
    const prop = property || {};
    const tnt = tenant || {};
    const unt = unit || {};
    const set = settings || {};

    const ownerName = set.ownerName || set.businessName || prop.name || 'Property Owner';
    const businessName = set.businessName || prop.name || 'RENTORA PROPERTIES';
    const address = set.address || prop.address || '';
    const upiId = set.upiId || '';

    const formattedBillingMonth = formatMonthReadable(bill.billingMonth);
    const formattedDueDate = formatFullBillDate(bill.dueDate);
    const formattedCreatedDate = formatFullBillDate(bill.createdAt || new Date().toISOString());

    const meterDays = calculateMeterDays(bill.previousMeterReadingDate, bill.currentMeterReadingDate);

    let billingPeriodText = '';
    if (bill.previousMeterReadingDate && bill.currentMeterReadingDate) {
      billingPeriodText = `${formatFullBillDate(bill.previousMeterReadingDate)} to ${formatFullBillDate(bill.currentMeterReadingDate)}`;
    } else {
      billingPeriodText = `01 ${formattedBillingMonth} to ${formattedBillingMonth}`;
    }

    let paymentsList = [];
    if (Array.isArray(passedPayments)) {
      paymentsList = passedPayments;
    } else {
      paymentsList = state.payments.filter(p => p.billId === bill.id);
    }

    const approvedPayments = paymentsList.filter(p => {
      if (p.status === 'rejected' || p.status === 'pending') return false;
      return p.status === 'approved' || (!p.status && (Number(p.amount) || Number(p.amountPaid) || 0) > 0);
    });
    approvedPayments.sort((a, b) => (a.paymentDate || '').localeCompare(b.paymentDate || ''));

    const paymentsByMonth = new Map();
    approvedPayments.forEach(p => {
      const { monthKey, monthLabel } = formatPaymentMonthYear(p.paymentDate);
      const amt = Number(p.amount) || Number(p.amountPaid) || 0;
      if (!monthKey) return;
      if (!paymentsByMonth.has(monthKey)) {
        paymentsByMonth.set(monthKey, {
          monthKey,
          monthLabel,
          totalReceived: 0,
          payments: []
        });
      }
      const group = paymentsByMonth.get(monthKey);
      group.totalReceived += amt;
      group.payments.push(p);
    });
    const monthGroups = Array.from(paymentsByMonth.values());

    const currentBillTotal = Number(bill.subtotal) || (
      (Number(bill.rent) || 0) +
      (Number(bill.electricityCharge) || 0) +
      (Number(bill.waterCharge) || 0) +
      (Number(bill.parkingCharge) || 0) +
      (Number(bill.maintenanceCharge) || 0) +
      (Number(bill.otherCharges) || 0)
    );
    const previousDue = Math.max(0, Number(bill.previousDue) || 0);
    const hasPrevDue = previousDue > 0;
    const totalPayable = Number(bill.totalAmount) || (currentBillTotal + previousDue);

    const approvedSum = approvedPayments.reduce((sum, p) => sum + (Number(p.amount) || Number(p.amountPaid) || 0), 0);
    const totalReceived = approvedSum > 0 ? approvedSum : Math.max(0, Number(bill.paidAmount) || 0);

    let previousDuePaid = 0;
    let currentBillPaid = 0;
    if (bill.previousDuePaid !== undefined && bill.currentBillPaid !== undefined) {
      previousDuePaid = Math.max(0, Number(bill.previousDuePaid));
      currentBillPaid = Math.max(0, Number(bill.currentBillPaid));
    } else {
      previousDuePaid = Math.min(previousDue, totalReceived);
      currentBillPaid = Math.min(currentBillTotal, Math.max(0, totalReceived - previousDuePaid));
    }

    const isPaid = bill.paymentStatus === 'paid' || (bill.remainingAmount !== undefined && Number(bill.remainingAmount) <= 0 && (totalPayable > 0 || totalReceived > 0));
    let remainingAmountDue = 0;
    if (isPaid) {
      remainingAmountDue = 0;
    } else if (bill.remainingAmount !== undefined) {
      remainingAmountDue = Math.max(0, Number(bill.remainingAmount));
    } else {
      remainingAmountDue = Math.max(0, totalPayable - (previousDuePaid + currentBillPaid));
    }

    const isPartial = !isPaid && totalReceived > 0 && remainingAmountDue > 0;
    const statusLabel = isPaid ? 'PAID' : isPartial ? 'PARTIALLY PAID' : 'UNPAID';
    const statusColor = isPaid ? '#059669' : isPartial ? '#d97706' : '#dc2626';

    let dynamicPaymentReceivedHeading = '';
    if (monthGroups.length === 1) {
      dynamicPaymentReceivedHeading = `Payment Received in ${monthGroups[0].monthLabel}`;
    } else if (monthGroups.length > 1) {
      const labels = monthGroups.map(g => g.monthLabel).join(', ');
      dynamicPaymentReceivedHeading = `Payment Received (${labels})`;
    } else {
      dynamicPaymentReceivedHeading = `Payment Received in ${formattedBillingMonth}`;
    }

    const qrUrl = upiId
      ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('upi://pay?pa=' + upiId + '&pn=' + encodeURIComponent(ownerName) + '&am=' + (remainingAmountDue > 0 ? remainingAmountDue : totalPayable) + '&cu=INR')}`
      : '';

    const rentoraLogoSrc = 'assets/images/rentora-logo.png';
    const ownerLogoSrc = set.logoUrl || '';

    // Mobile Bill CSS Styles matching pdfService.ts & A4 Printable Boundary
    const invoiceCss = `
    @page {
      size: A4 portrait;
      margin: 8mm 7mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background-color: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #1f2937;
      font-size: 10.5px;
      line-height: 14px;
    }
    @media print {
      html, body {
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      .invoice-wrapper {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 auto !important;
        padding: 0 !important;
      }
    }
    .invoice-wrapper {
      width: 700px;
      max-width: 700px;
      margin: 0;
      background: #ffffff;
      padding: 0;
      box-sizing: border-box;
    }
    .top-header {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      position: relative;
      width: 100%;
      box-sizing: border-box;
    }
    .business-title {
      font-size: 22px;
      font-weight: 800;
      color: #3b49df;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .business-address {
      font-size: 10.5px;
      color: #8e9aa8;
      margin: 2px 0 0 0;
      text-transform: lowercase;
      font-weight: 600;
    }
    .doc-title-block {
      text-align: center;
      margin-top: 8px;
      margin-bottom: 8px;
    }
    .doc-title {
      font-size: 13.5px;
      font-weight: 800;
      color: #111827;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .doc-subtitle {
      font-size: 10px;
      color: #6b7280;
      font-weight: 700;
      margin: 2px 0 0 0;
    }
    .purple-line {
      height: 1.5px;
      background-color: #3b49df;
      width: 100%;
      margin-bottom: 5px;
    }
    .due-date-row {
      text-align: right;
      margin-bottom: 5px;
      padding-right: 2px;
    }
    .due-date-text {
      font-size: 11px;
      font-weight: 800;
      color: #dc2626;
      margin: 0;
      white-space: nowrap;
    }
    .tenant-details-box {
      border: 1px solid #9ca3af;
      border-radius: 4px;
      padding: 6px 10px;
      margin-bottom: 5px;
      background: #ffffff;
      width: 100%;
      box-sizing: border-box;
    }
    .tenant-grid-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .tenant-grid-td {
      padding: 2px 0;
      vertical-align: top;
      font-size: 10px;
      color: #1f2937;
      word-break: break-word;
    }
    .tenant-grid-label {
      font-weight: 500;
      color: #374151;
    }
    .tenant-grid-value {
      font-weight: 700;
      color: #111827;
    }
    .period-row {
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      font-weight: 700;
      color: #374151;
      margin-bottom: 8px;
      padding: 0 2px;
      width: 100%;
      box-sizing: border-box;
    }
    .main-charges-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin-bottom: 8px;
      border: 1px solid #111827;
      box-sizing: border-box;
    }
    .main-charges-table th {
      background: #3b49df;
      color: #ffffff;
      font-size: 9px;
      line-height: 11px;
      font-weight: 800;
      padding: 4px 3px;
      border: 1px solid #111827;
      text-transform: capitalize;
      word-break: break-word;
      overflow-wrap: break-word;
      box-sizing: border-box;
    }
    .main-charges-table td {
      border: 1px solid #111827;
      padding: 3.5px 3px;
      font-size: 9.5px;
      line-height: 12px;
      color: #111827;
      vertical-align: middle;
      word-break: break-word;
      overflow-wrap: break-word;
      box-sizing: border-box;
    }
    .center-text {
      text-align: center;
    }
    .right-text {
      text-align: right;
      white-space: nowrap;
    }
    .total-amount-row {
      background-color: #eff6ff;
      font-weight: 800;
    }
    .total-amount-row td {
      font-weight: 800;
      font-size: 10px;
    }
    .notes-header {
      font-size: 10.5px;
      font-weight: 800;
      color: #1f2937;
      margin: 6px 0 2px 0;
      text-transform: capitalize;
    }
    .notes-body {
      font-size: 9.5px;
      color: #374151;
      margin: 0 0 6px 0;
      line-height: 13px;
      font-weight: 500;
    }
    .payment-scan-container {
      text-align: center;
      margin-top: 6px;
      margin-bottom: 6px;
    }
    .payment-scan-title {
      font-size: 12px;
      font-weight: 800;
      color: #3b49df;
      margin: 0 0 5px 0;
      letter-spacing: 0.2px;
    }
    .qr-image-wrapper {
      margin: 0 auto 3px auto;
      width: 95px;
      height: 95px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-image {
      width: 95px;
      height: 95px;
      object-fit: contain;
    }
    .upi-id-bold {
      font-size: 15px;
      font-weight: 800;
      color: #4b5563;
      margin: 3px 0;
      letter-spacing: 0.5px;
    }
    .payment-logos-strip {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      margin-top: 5px;
      flex-wrap: wrap;
    }
    .brand-logo-text {
      font-size: 9px;
      font-weight: 800;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
    }
    .phonepe-brand { color: #5f259f; border-color: #5f259f; background: #f5f0ff; }
    .paytm-brand { color: #00baf2; border-color: #00baf2; background: #e0f7fe; }
    .gpay-brand { color: #1a73e8; border-color: #34a853; background: #f1f3f4; }
    .bhim-brand { color: #f47b20; border-color: #0b51a0; background: #fff5eb; }
    .amazon-brand { color: #ff9900; border-color: #111827; background: #fff8eb; }
    .mobikwik-brand { color: #00539c; border-color: #00539c; background: #f0f7ff; }
    .freecharge-brand { color: #ff3f1a; border-color: #ff3f1a; background: #fff1f0; }
    .signature-bottom-container {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
      padding-right: 5px;
    }
    .signature-inner-box {
      text-align: center;
      width: 160px;
    }
    .signature-label {
      font-size: 11px;
      font-weight: 800;
      color: #4b5563;
      margin: 0;
    }
    `;

    // Mobile Bill Body HTML Template matching pdfService.ts
    const invoiceBody = `
  <div class="invoice-wrapper">
    <!-- Header Area -->
    <div class="top-header" style="display: flex; flex-direction: column; align-items: stretch;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
        <!-- Left Side: Rentora App Branding -->
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
          <img src="${rentoraLogoSrc}" style="width: 48px; height: 48px; border-radius: 8px; object-fit: contain;" alt="Rentora" onerror="this.style.display='none'" />
          <span style="font-size: 13px; font-weight: 900; color: #1e3a8a; letter-spacing: 0.5px; line-height: 14px;">Rentora</span>
        </div>
        
        <!-- Right Side: Owner Business Logo -->
        <div style="display: flex; align-items: flex-start; justify-content: flex-end;">
          ${ownerLogoSrc ? `<img src="${ownerLogoSrc}" style="max-height: 55px; max-width: 110px; object-fit: contain;" alt="Logo" />` : ''}
        </div>
      </div>
      
      <!-- Centered Owner/Business Information -->
      <div class="center-business-info" style="margin-top: 10px; margin-left: 0; text-align: center; width: 100%;">
        <h1 class="business-title">${businessName}</h1>
        <p class="business-address">${address || prop.address || prop.name || ''}</p>
      </div>
    </div>

    <!-- Document Invoice Title -->
    <div class="doc-title-block">
      <h2 class="doc-title">RENT SUMMARY INVOICE</h2>
      <p class="doc-subtitle">Month: ${formattedBillingMonth}</p>
    </div>

    <!-- Divider Line -->
    <div class="purple-line"></div>

    <!-- Right Aligned Due Date -->
    <div class="due-date-row">
      <p class="due-date-text">Due Date: ${formattedDueDate}</p>
    </div>

    <!-- Bordered Tenant Box -->
    <div class="tenant-details-box">
      <table class="tenant-grid-table">
        <tr>
          <td class="tenant-grid-td" style="width: 50%;">
            <span class="tenant-grid-label">Flat No. :</span>
            <span class="tenant-grid-value">${bill.unitNumber || unt.unitNumber || unt.roomNumber || bill.roomNumber || 'N/A'}</span>
          </td>
          <td class="tenant-grid-td" style="width: 50%;">
            <span class="tenant-grid-label">Maintenance :</span>
            <span class="tenant-grid-value">${(Number(bill.maintenanceCharge) || 0) > 0 ? `₹${Number(bill.maintenanceCharge).toLocaleString('en-IN')}` : 'Nil'}</span>
          </td>
        </tr>
        <tr>
          <td class="tenant-grid-td" style="width: 50%;">
            <span class="tenant-grid-label">Name :</span>
            <span class="tenant-grid-value">${bill.tenantName || tnt.name || 'Tenant'}</span>
          </td>
          <td class="tenant-grid-td" style="width: 50%;">
            <span class="tenant-grid-label">Security :</span>
            <span class="tenant-grid-value">${tnt.advanceAmount && tnt.advanceAmount > 0 ? `₹${Number(tnt.advanceAmount).toLocaleString('en-IN')}` : (tnt.securityDeposit && tnt.securityDeposit > 0 ? `₹${Number(tnt.securityDeposit).toLocaleString('en-IN')}` : 'Nil')}</span>
          </td>
        </tr>
        <tr>
          <td class="tenant-grid-td" style="width: 50%;">
            <span class="tenant-grid-label">Phone No. :</span>
            <span class="tenant-grid-value">${tnt.phone || tnt.mobile || bill.tenantPhone || 'N/A'}</span>
          </td>
          <td class="tenant-grid-td" style="width: 50%;">
            <span class="tenant-grid-label">Monthly Rent :</span>
            <span class="tenant-grid-value">₹${Number(bill.rent !== undefined ? bill.rent : (bill.rentAmount || 0)).toLocaleString('en-IN')}</span>
          </td>
        </tr>
        <tr>
          <td class="tenant-grid-td" style="width: 50%;">
            <span class="tenant-grid-label">Id:</span>
            <span class="tenant-grid-value">${tnt.idProofType && tnt.idProofType !== 'none' ? `${tnt.idProofType} ${tnt.documentNumber || ''}`.trim() : 'None'}</span>
          </td>
          <td class="tenant-grid-td" style="width: 50%;">
            <span class="tenant-grid-label">Payment Status :</span>
            <span class="tenant-grid-value" style="color: ${statusColor}; text-transform: uppercase;">
              ${statusLabel}
            </span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Underbox Period Line -->
    <div class="period-row">
      <div>${billingPeriodText}</div>
      <div>Bill Issued Date:${formattedCreatedDate}</div>
    </div>

    <!-- Main Boxed Charges Table -->
    <table class="main-charges-table">
      <thead>
        <tr>
          <th colspan="7">Description</th>
          <th style="width: 16%; text-align: right;">Amount (₹)</th>
        </tr>
        <tr>
          <th style="width: 22%;">Bill Type</th>
          <th class="center-text" style="width: 13%;">Current Month<br>(Reading/Date)</th>
          <th class="center-text" style="width: 13%;">Last Month<br>(Reading/Date)</th>
          <th class="center-text" style="width: 11%;">Total Unit</th>
          <th class="center-text" style="width: 8%;">Rate (₹)</th>
          <th class="center-text" style="width: 8%;">Fixed (₹)</th>
          <th class="center-text" style="width: 9%;">Govt.<br>(Bill/Date)</th>
          <th style="width: 16%; text-align: right;">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        <!-- Electricity Row -->
        ${(() => {
          const eType = bill.electricityBillType || 'perUnit';
          if (eType === 'fixed') {
            return `
              <tr class="charges-tr">
                <td>Electricity Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">Fixed</span></td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">₹${bill.electricityCharge}</td>
                <td class="center-text">-</td>
                <td class="right-text">${bill.electricityCharge}</td>
              </tr>
            `;
          } else if (eType === 'none') {
            return `
              <tr class="charges-tr">
                <td>Electricity Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">Included / Self</span></td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="right-text">0</td>
              </tr>
            `;
          } else {
            const elecUnitsVal = Number(bill.electricityUnits !== undefined ? bill.electricityUnits : (bill.unitsConsumed || 0));
            const elecRateVal = Number(bill.electricityRate !== undefined ? bill.electricityRate : (bill.ratePerUnit || 0));
            const elecChargeVal = Number(bill.electricityCharge !== undefined ? bill.electricityCharge : (bill.electricityAmount || 0));
            const currMeterVal = bill.currentMeterReading !== undefined ? bill.currentMeterReading : (bill.currentReading || 0);
            const prevMeterVal = bill.previousMeterReading !== undefined ? bill.previousMeterReading : (bill.previousReading || 0);

            return `
              <tr class="charges-tr">
                <td>Electricity Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">${elecUnitsVal} Units x ₹${elecRateVal}</span></td>
                <td class="center-text">
                  ${currMeterVal}<br>
                  <span style="font-size: 8px; color: #4b5563;">
                    ${bill.currentMeterReadingDate ? formatShortBillDate(bill.currentMeterReadingDate) : 'N/A'}
                  </span>
                </td>
                <td class="center-text">
                  ${prevMeterVal}<br>
                  <span style="font-size: 8px; color: #4b5563;">
                    ${bill.previousMeterReadingDate ? formatShortBillDate(bill.previousMeterReadingDate) : 'N/A'}
                  </span>
                </td>
                <td class="center-text">
                  ${elecUnitsVal} Units<br>
                  <span style="font-size: 8px; color: #4b5563;">
                    ${meterDays !== null ? `(${meterDays} Days)` : ''}
                  </span>
                </td>
                <td class="center-text">${elecRateVal}</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="right-text">${elecChargeVal.toLocaleString('en-IN')}</td>
              </tr>
            `;
          }
        })()}

        <!-- Water Row -->
        ${(() => {
          const wType = bill.waterBillType || (bill.waterCharge > 0 ? 'fixed' : 'none');
          if (wType === 'fixed') {
            return `
              <tr class="charges-tr">
                <td>Water Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">Fixed</span></td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">₹${bill.waterCharge}</td>
                <td class="center-text">-</td>
                <td class="right-text">${bill.waterCharge}</td>
              </tr>
            `;
          } else if (wType === 'none') {
            return `
              <tr class="charges-tr">
                <td>Water Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">Included / Self</span></td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="right-text">0</td>
              </tr>
            `;
          } else {
            const wRate = bill.waterRatePerUnit || 0;
            return `
              <tr class="charges-tr">
                <td>Water Bill<br><span style="font-size: 8.5px; color: #4b5563; font-weight: 700;">${bill.electricityUnits || 0} Units x ₹${wRate}</span></td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="center-text">${wRate}</td>
                <td class="center-text">-</td>
                <td class="center-text">-</td>
                <td class="right-text">${bill.waterCharge}</td>
              </tr>
            `;
          }
        })()}

        <!-- Parking Row -->
        <tr class="charges-tr">
          <td colspan="7">Parking</td>
          <td class="right-text">${bill.parkingCharge || 0}</td>
        </tr>

        <!-- Maintenance Row -->
        <tr class="charges-tr">
          <td colspan="7">Maintenance</td>
          <td class="right-text">${bill.maintenanceCharge || 0}</td>
        </tr>

        <!-- Monthly Rent Row -->
        <tr class="charges-tr">
          <td colspan="7">Rent</td>
          <td class="right-text">${bill.rent || 0}</td>
        </tr>

        <!-- Other Charges Row -->
        <tr class="charges-tr">
          <td colspan="7">Other Charges</td>
          <td class="right-text">${bill.otherCharges || 0}</td>
        </tr>

        <!-- Totals & Payment Balance Breakdown -->
        ${(() => {
          let html = '';
          if (hasPrevDue) {
            html += `
              <tr class="charges-tr" style="font-weight: 700;">
                <td colspan="7">Current Bill Total</td>
                <td class="right-text">₹ ${currentBillTotal.toLocaleString('en-IN')}</td>
              </tr>
              <tr class="charges-tr" style="color: #dc2626; font-weight: 700;">
                <td colspan="7">Previous Due</td>
                <td class="right-text">₹ ${previousDue.toLocaleString('en-IN')}</td>
              </tr>
            `;

            if (totalReceived > 0) {
              html += `
                <tr class="charges-tr" style="font-weight: 800; background-color: #f9fafb;">
                  <td colspan="7">Total Payable</td>
                  <td class="right-text">₹ ${totalPayable.toLocaleString('en-IN')}</td>
                </tr>
                <tr class="charges-tr" style="color: #059669; font-weight: 700;">
                  <td colspan="7">${dynamicPaymentReceivedHeading}</td>
                  <td class="right-text">₹ ${totalReceived.toLocaleString('en-IN')}</td>
                </tr>
                <tr class="charges-tr" style="color: #4b5563; font-size: 9.5px;">
                  <td colspan="7" style="padding-left: 20px;">• Previous Due Cleared</td>
                  <td class="right-text">₹ ${previousDuePaid.toLocaleString('en-IN')}</td>
                </tr>
                <tr class="charges-tr" style="color: #4b5563; font-size: 9.5px;">
                  <td colspan="7" style="padding-left: 20px;">• Current Month Paid</td>
                  <td class="right-text">₹ ${currentBillPaid.toLocaleString('en-IN')}</td>
                </tr>
                <tr class="total-amount-row">
                  <td colspan="7">Remaining Due</td>
                  <td class="right-text" style="color: ${remainingAmountDue > 0 ? '#dc2626' : '#059669'};">₹ ${remainingAmountDue.toLocaleString('en-IN')}</td>
                </tr>
              `;
            } else {
              html += `
                <tr class="charges-tr" style="color: #6b7280; font-size: 9.5px;">
                  <td colspan="7">${dynamicPaymentReceivedHeading}</td>
                  <td class="right-text">₹ 0</td>
                </tr>
                <tr class="total-amount-row">
                  <td colspan="7">Total Payable</td>
                  <td class="right-text">₹ ${totalPayable.toLocaleString('en-IN')}</td>
                </tr>
              `;
            }
          } else {
            if (totalReceived > 0) {
              html += `
                <tr class="charges-tr" style="font-weight: 800; background-color: #f9fafb;">
                  <td colspan="7">Total Amount</td>
                  <td class="right-text">₹ ${totalPayable.toLocaleString('en-IN')}</td>
                </tr>
                <tr class="charges-tr" style="color: #059669; font-weight: 700;">
                  <td colspan="7">${dynamicPaymentReceivedHeading}</td>
                  <td class="right-text">₹ ${totalReceived.toLocaleString('en-IN')}</td>
                </tr>
                <tr class="total-amount-row">
                  <td colspan="7">Remaining Due</td>
                  <td class="right-text" style="color: ${remainingAmountDue > 0 ? '#dc2626' : '#059669'};">₹ ${remainingAmountDue.toLocaleString('en-IN')}</td>
                </tr>
              `;
            } else {
              html += `
                <tr class="charges-tr" style="color: #6b7280; font-size: 9.5px;">
                  <td colspan="7">${dynamicPaymentReceivedHeading}</td>
                  <td class="right-text">₹ 0</td>
                </tr>
                <tr class="total-amount-row">
                  <td colspan="7">Total Amount</td>
                  <td class="right-text">₹ ${totalPayable.toLocaleString('en-IN')}</td>
                </tr>
              `;
            }
          }
          return html;
        })()}
      </tbody>
    </table>

    <!-- Payment Details & Month-Wise Allocation Section -->
    ${(() => {
      let paymentBreakdownHtml = '';
      if (monthGroups.length > 0) {
        paymentBreakdownHtml = monthGroups.map(group => `
          <div style="margin-bottom: 5px;">
            <div style="font-weight: 800; font-size: 10.5px; color: #111827;">
              Payment Received in ${group.monthLabel}: <span style="color: #059669; font-weight: 800;">₹ ${group.totalReceived.toLocaleString('en-IN')}</span>
            </div>
            ${group.payments.map(p => {
              const pAmt = (Number(p.amount) || Number(p.amountPaid) || 0).toLocaleString('en-IN');
              const pMethod = (p.paymentMethod || 'Payment').toUpperCase();
              const pDate = p.paymentDate ? formatShortBillDate(p.paymentDate) : 'N/A';
              const txn = p.transactionId ? ` (Txn: ${p.transactionId})` : '';
              return `
                <div style="font-size: 9.5px; color: #4b5563; padding-left: 10px; margin-top: 1px;">
                  • ${pDate} — ${pMethod}${txn}: <span style="font-weight: 700; color: #111827;">₹ ${pAmt}</span>
                </div>
              `;
            }).join('')}
          </div>
        `).join('');
      } else if (totalReceived > 0) {
        paymentBreakdownHtml = `
          <div style="margin-bottom: 5px; font-size: 10.5px; font-weight: 800; color: #111827;">
            ${dynamicPaymentReceivedHeading}: <span style="color: #059669; font-weight: 800;">₹ ${totalReceived.toLocaleString('en-IN')}</span>
          </div>
        `;
      } else {
        paymentBreakdownHtml = `
          <div style="margin-bottom: 3px; font-size: 10.5px; color: #4b5563;">
            <span style="font-weight: 800; color: #111827;">Payment Received in ${formattedBillingMonth}:</span>
            <span style="font-weight: 800; color: #dc2626; margin-left: 4px;">₹ 0</span>
            <span style="font-style: italic; color: #6b7280; font-size: 9.5px; margin-left: 6px;">(No payment received this month)</span>
          </div>
        `;
      }

      return `
        <div class="payment-allocation-box" style="margin-top: 8px; margin-bottom: 10px; border: 1px solid #111827; background-color: #ffffff; page-break-inside: avoid; box-sizing: border-box; width: 100%;">
          <div style="background-color: #3b49df; color: #ffffff; padding: 5px 8px; font-weight: 800; font-size: 10px; display: flex; justify-content: space-between; align-items: center; box-sizing: border-box; width: 100%;">
            <span>PAYMENT & ALLOCATION DETAILS</span>
            <span style="font-size: 9px; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap;">STATUS: ${statusLabel}</span>
          </div>
          
          <div style="padding: 7px 9px;">
            ${paymentBreakdownHtml}

            <!-- Summary Allocation Breakdown Table -->
            <table style="width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 10.5px; border-top: 1px solid #e5e7eb; padding-top: 4px;">
              <tr>
                <td style="padding: 2px 0; color: #374151;">Current Month Bill:</td>
                <td style="padding: 2px 0; text-align: right; font-weight: 700; color: #111827;">₹ ${currentBillTotal.toLocaleString('en-IN')}</td>
              </tr>
              ${hasPrevDue ? `
              <tr>
                <td style="padding: 2px 0; color: #dc2626;">Previous Outstanding Due:</td>
                <td style="padding: 2px 0; text-align: right; font-weight: 700; color: #dc2626;">₹ ${previousDue.toLocaleString('en-IN')}</td>
              </tr>
              <tr style="font-weight: 800; border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1;">
                <td style="padding: 3px 0; color: #111827;">Total Payable:</td>
                <td style="padding: 3px 0; text-align: right; color: #111827;">₹ ${totalPayable.toLocaleString('en-IN')}</td>
              </tr>
              ` : ''}
              <tr style="color: #059669; font-weight: 700;">
                <td style="padding: 2px 0;">${dynamicPaymentReceivedHeading}:</td>
                <td style="padding: 2px 0; text-align: right; font-weight: 800; color: #059669;">₹ ${totalReceived.toLocaleString('en-IN')}</td>
              </tr>
              ${hasPrevDue ? `
              <tr style="color: #4b5563; font-size: 10px;">
                <td style="padding: 1px 0 1px 12px;">• Previous Due Cleared:</td>
                <td style="padding: 1px 0; text-align: right; font-weight: 700; color: #059669;">₹ ${previousDuePaid.toLocaleString('en-IN')}</td>
              </tr>
              <tr style="color: #4b5563; font-size: 10px;">
                <td style="padding: 1px 0 1px 12px;">• Amount Applied to Current Month's Bill:</td>
                <td style="padding: 1px 0; text-align: right; font-weight: 700; color: #059669;">₹ ${currentBillPaid.toLocaleString('en-IN')}</td>
              </tr>
              ` : ''}
              <tr style="font-weight: 800; font-size: 11px; border-top: 1px solid #111827; background-color: #eff6ff;">
                <td style="padding: 4px 6px; color: #111827;">Remaining Amount Due:</td>
                <td style="padding: 4px 6px; text-align: right; color: ${remainingAmountDue > 0 ? '#dc2626' : '#059669'}; font-size: 11.5px;">₹ ${remainingAmountDue.toLocaleString('en-IN')}</td>
              </tr>
            </table>
          </div>
        </div>
      `;
    })()}

    <!-- Notes Section -->
    <div class="notes-header">Notes</div>
    <div class="notes-body">
      Kindly clear the bill amount before the due date to avoid any late charges; late payment may attract additional charges as per agreement terms.<br>
      कृपया नियत तिथि से पहले बिल राशि का भुगतान कर दें, अन्यथा अनुबंध की शर्तों के अनुसार विलंब शुल्क 100 लागू हो सकता है।
    </div>

    <!-- Payment Scan Area -->
    <div class="payment-scan-container">
      <h3 class="payment-scan-title">Scan QR Code or copy UPI ID for payment</h3>
      ${upiId ? `
        <div class="qr-image-wrapper">
          <img src="${qrUrl}" class="qr-image" alt="UPI QR Code" />
        </div>
        <div class="upi-id-bold">${upiId}</div>
      ` : `
        <div style="border:1px dashed #ccc; width:120px; height:120px; margin:0 auto 8px auto; display:flex; align-items:center; justify-content:center; font-size:10px; color:#aaa;">No UPI Configured</div>
      `}
      
      <!-- Brands Strip -->
      <div class="payment-logos-strip">
        <span class="brand-logo-text phonepe-brand">PhonePe</span>
        <span class="brand-logo-text paytm-brand">Paytm</span>
        <span class="brand-logo-text gpay-brand">G Pay</span>
        <span class="brand-logo-text bhim-brand">BHIM</span>
        <span class="brand-logo-text amazon-brand">amazon pay</span>
        <span class="brand-logo-text mobikwik-brand">MobiKwik</span>
        <span class="brand-logo-text freecharge-brand">freecharge</span>
      </div>
    </div>

    <!-- Signatory Footer Area -->
    <div class="signature-bottom-container">
      <div class="signature-inner-box">
        <p class="signature-label" style="font-size: 11px; font-weight: 800; color: #4b5563; margin: 0 0 4px 0; text-transform: uppercase;">Authorized By</p>
        <div style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: #111827; height: 35px; display: flex; align-items: center; justify-content: center; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
          ${ownerName}
        </div>
        <div class="signature-line" style="border-top: 1px solid #111827; margin-top: 4px;"></div>
      </div>
    </div>
  </div>
    `;

    return {
      css: invoiceCss,
      body: invoiceBody,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rent Bill - ${bill.billNumber || 'Invoice'}</title><style>${invoiceCss}</style></head><body>${invoiceBody}</body></html>`
    };
  }

  function buildMobileBillPdfHtml(bill, tenant, property, unit, settings, passedPayments) {
    const data = buildMobileBillPdfData(bill, tenant, property, unit, settings, passedPayments);
    return data.html;
  }

  window.downloadBillPDF = async function (billId) {
    const bill = state.bills.find(b => b.id === billId);
    if (!bill) {
      showToast('Bill not found!', 'error');
      return;
    }

    const tenant = state.tenants.find(t => t.id === bill.tenantId);
    const property = state.properties.find(p => p.id === bill.propertyId);
    const unit = state.units.find(u => u.id === bill.unitId || (tenant && u.id === tenant.unitId));
    const billPayments = state.payments.filter(p => p.billId === bill.id);

    const filename = getBillPDFFilename(tenant ? tenant.name : bill.tenantName, bill.billNumber);
    showToast('Preparing mobile bill PDF...', 'info');

    const pdfData = buildMobileBillPdfData(bill, tenant, property, unit, state.settings, billPayments);

    if (typeof html2pdf !== 'undefined') {
      let container = document.getElementById('rentora-pdf-export-sandbox');
      if (!container) {
        container = document.createElement('div');
        container.id = 'rentora-pdf-export-sandbox';
        document.body.appendChild(container);
      }

      // Positioning at (top: 0, left: 0) inside viewport coordinates,
      // hidden behind page content with negative z-index so html2canvas captures actual pixels accurately
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '700px';
      container.style.minHeight = '980px';
      container.style.zIndex = '-99999';
      container.style.backgroundColor = '#ffffff';
      container.style.opacity = '1';
      container.style.visibility = 'visible';
      container.style.pointerEvents = 'none';
      container.style.overflow = 'hidden';
      container.style.margin = '0';
      container.style.padding = '0';

      container.innerHTML = `
        <style>
          ${pdfData.css}
        </style>
        ${pdfData.body}
      `;

      try {
        // Wait for all images inside container to finish loading
        const images = Array.from(container.querySelectorAll('img'));
        await Promise.all(images.map(img => {
          if (img.complete && img.naturalWidth !== 0) return Promise.resolve();
          return new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 2000);
          });
        }));

        // Wait for web fonts if available
        if (document.fonts && document.fonts.ready) {
          try { await document.fonts.ready; } catch (e) {}
        }

        // Allow browser rendering tick to compute layout and styles
        await new Promise(r => setTimeout(r, 200));

        const targetEl = container.querySelector('.invoice-wrapper') || container;

        const opt = {
          margin: [8, 8, 8, 8],
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            scrollX: 0,
            scrollY: 0
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        await html2pdf().set(opt).from(targetEl).save();
        showToast(`Downloaded: ${filename}`, 'success');
      } catch (err) {
        console.error('html2pdf generation error:', err);
        showToast(`PDF generation error: ${err.message || 'Capture failed'}. Using Print fallback.`, 'error');
        printBillPDF(billId);
      } finally {
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }
    } else {
      showToast('PDF library not ready. Opening Print Invoice preview...', 'info');
      printBillPDF(billId);
    }
  };

  window.printBillPDF = function (billId) {
    const bill = state.bills.find(b => b.id === billId);
    if (!bill) return;

    const tenant = state.tenants.find(t => t.id === bill.tenantId);
    const property = state.properties.find(p => p.id === bill.propertyId);
    const unit = state.units.find(u => u.id === bill.unitId || (tenant && u.id === tenant.unitId));
    const billPayments = state.payments.filter(p => p.billId === bill.id);

    const pdfData = buildMobileBillPdfData(bill, tenant, property, unit, state.settings, billPayments);

    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(pdfData.html);
    frameDoc.close();

    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 2000);
    }, 500);
  };

  // ==========================================================================
  // 13.6 LANDLORD SETTINGS & BUSINESS CONFIGURATION (MATCHES MOBILE 1:1)
  // Handles landlord profile, UPI payment gateway, and bill customization
  // ==========================================================================
  window.populateSettingsForm = function () {
    const s = state.settings || {};
    const ownerNameInput = document.getElementById('settingsOwnerName');
    const businessNameInput = document.getElementById('settingsBusinessName');
    const phoneInput = document.getElementById('settingsPhone');
    const addressInput = document.getElementById('settingsAddress');
    const upiIdInput = document.getElementById('settingsUpiId');
    const instructionsInput = document.getElementById('settingsPaymentInstructions');
    const policySelect = document.getElementById('settingsExtraStayPolicy');
    const logoUrlInput = document.getElementById('settingsLogoUrl');
    const noticeEl = document.getElementById('settingsLastSavedNotice');

    if (ownerNameInput) ownerNameInput.value = s.ownerName || (state.currentUser ? (state.currentUser.displayName || '') : '');
    if (businessNameInput) businessNameInput.value = s.businessName || (state.activeProperty ? state.activeProperty.name : '');
    if (phoneInput) phoneInput.value = s.phone || '';
    if (addressInput) addressInput.value = s.address || (state.activeProperty ? state.activeProperty.address : '');
    if (upiIdInput) upiIdInput.value = s.upiId || '';
    if (instructionsInput) instructionsInput.value = s.paymentInstructions || 'Please pay by the due date to avoid late fees. Kindly send a payment screenshot for verification.';
    if (policySelect) policySelect.value = s.extraStayPolicy || 'fixed30';
    if (logoUrlInput) logoUrlInput.value = s.logoUrl || '';

    if (noticeEl) {
      if (s.updatedAt) {
        const d = new Date(s.updatedAt);
        noticeEl.textContent = `Last saved: ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      } else {
        noticeEl.textContent = 'Settings are synced in real-time with your Rentora Mobile App account.';
      }
    }
  };

  window.handleSaveSettings = async function (e) {
    if (e) e.preventDefault();
    const btn = document.getElementById('saveSettingsBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-ring" style="width: 14px; height: 14px; border-width: 2px; display: inline-block; vertical-align: middle; margin-right: 6px;"></span> Saving...`;
    }

    const ownerName = document.getElementById('settingsOwnerName')?.value.trim() || '';
    const businessName = document.getElementById('settingsBusinessName')?.value.trim() || '';
    const phone = document.getElementById('settingsPhone')?.value.trim() || '';
    const address = document.getElementById('settingsAddress')?.value.trim() || '';
    const upiId = document.getElementById('settingsUpiId')?.value.trim() || '';
    const paymentInstructions = document.getElementById('settingsPaymentInstructions')?.value.trim() || '';
    const extraStayPolicy = document.getElementById('settingsExtraStayPolicy')?.value || 'fixed30';
    const logoUrl = document.getElementById('settingsLogoUrl')?.value.trim() || '';

    if (!ownerName) {
      showToast('Owner / Landlord Full Name is required', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Save Settings'; }
      return;
    }

    if (!phone) {
      showToast('Billing Contact Phone Number is required', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Save Settings'; }
      return;
    }

    if (upiId) {
      const upiRegex = /^[\w.\-_]+@[\w\-]+$/;
      if (!upiRegex.test(upiId)) {
        showToast('Please enter a valid UPI ID (e.g., name@bank or 9876543210@paytm)', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Save Settings'; }
        return;
      }
    }

    const ownerId = state.currentUser ? state.currentUser.uid : 'demo-user-1';

    const updatedSettings = {
      id: ownerId,
      ownerName,
      businessName,
      phone,
      address,
      upiId,
      paymentInstructions: paymentInstructions || 'Please pay by the due date to avoid late fees. Kindly send a payment screenshot for verification.',
      extraStayPolicy,
      logoUrl,
      updatedAt: new Date().toISOString()
    };

    try {
      if (isFirebaseReady && fbDb && state.currentUser && !state.isDemoMode) {
        await fbDb.collection('settings').doc(ownerId).set(updatedSettings, { merge: true });
      }

      state.settings = { ...updatedSettings };
      if (state.isDemoMode) {
        DEMO_FIXTURES.settings = { ...updatedSettings };
      }

      showToast('Landlord settings and UPI details updated successfully!', 'success');
      populateSettingsForm();
    } catch (err) {
      console.error('Failed to save settings:', err);
      showToast(`Error saving settings: ${err.message || 'Network error'}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save Settings`;
      }
    }
  };

  window.openRecordPaymentModal = function (preselectedBillId) {
    const pendingBills = state.bills.filter(b => b.remainingAmount > 0);
    const select = document.getElementById('paymentSelectBill');

    if (pendingBills.length === 0) {
      showToast('All bills are fully settled! No pending dues.', 'info');
      return;
    }

    select.innerHTML = pendingBills.map(b => {
      const tenant = state.tenants.find(t => t.id === b.tenantId);
      const tName = b.tenantName || (tenant ? tenant.name : 'Tenant');
      return `
        <option value="${b.id}" data-due="${b.remainingAmount}">
          ${b.billNumber || 'Bill'} - ${tName} (Unit ${b.unitNumber}) - Due: ₹${Number(b.remainingAmount).toLocaleString('en-IN')}
        </option>
      `;
    }).join('');

    if (preselectedBillId && pendingBills.some(b => b.id === preselectedBillId)) {
      select.value = preselectedBillId;
    }

    window.handlePaymentBillSelect(select.value);

    document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('paymentTxnId').value = '';

    openModal('modalRecordPayment');
  };

  window.handlePaymentBillSelect = function (billId) {
    const bill = state.bills.find(b => b.id === billId);
    if (bill) {
      document.getElementById('paymentAmount').value = bill.remainingAmount;
      document.getElementById('paymentAmount').max = bill.remainingAmount;
    }
  };

  window.handleRecordPayment = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('recordPaymentSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Recording...';

    const billId = document.getElementById('paymentSelectBill').value;
    const amount = parseFloat(document.getElementById('paymentAmount').value) || 0;
    const paymentDate = document.getElementById('paymentDate').value;
    const paymentMethod = document.getElementById('paymentMethod').value;
    const txnId = document.getElementById('paymentTxnId').value.trim();

    const bill = state.bills.find(b => b.id === billId);
    if (!bill) {
      showToast('Bill not found!', 'error');
      btn.disabled = false;
      btn.textContent = 'Confirm Payment';
      return;
    }

    const newPaid = Number(bill.paidAmount || 0) + amount;
    const newRemaining = Math.max(0, Number(bill.totalAmount || 0) - newPaid);
    const newStatus = newRemaining === 0 ? 'paid' : 'partial';

    const paymentRecord = {
      id: 'pay_' + Date.now(),
      ownerId: state.currentUser ? state.currentUser.uid : 'demo-user-1',
      billId: bill.id,
      tenantId: bill.tenantId,
      amount,
      paymentDate,
      paymentMethod,
      transactionId: txnId,
      createdAt: new Date().toISOString()
    };

    if (state.currentUser && isFirebaseReady && fbDb) {
      try {
        await fbDb.collection('payments').add(paymentRecord);
        await fbDb.collection('bills').doc(bill.id).update({
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          paymentStatus: newStatus,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        showToast(`Failed to record payment: ${err.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Confirm Payment';
        return;
      }
    } else {
      state.payments.unshift(paymentRecord);
      bill.paidAmount = newPaid;
      bill.remainingAmount = newRemaining;
      bill.paymentStatus = newStatus;
    }

    btn.disabled = false;
    btn.textContent = 'Confirm Payment';
    closeModal('modalRecordPayment');
    renderBillsTab();
    showToast(`Payment of ₹${amount.toLocaleString('en-IN')} recorded successfully!`, 'success');
  };

  window.deleteBill = async function (billId) {
    const bill = state.bills.find(b => b.id === billId);
    if (!bill) return;

    if (!confirm(`Are you sure you want to permanently delete bill ${bill.billNumber || ''}?`)) {
      return;
    }

    if (state.currentUser && isFirebaseReady && fbDb) {
      try {
        await fbDb.collection('bills').doc(billId).delete();
      } catch (err) {
        showToast(`Failed to delete bill: ${err.message}`, 'error');
        return;
      }
    } else {
      state.bills = state.bills.filter(b => b.id !== billId);
    }

    renderBillsTab();
    showToast('Bill deleted successfully.', 'info');
  };

  // ==========================================================================
  // 13. LANDING PAGE LIVE CALCULATOR WIDGET
  // ==========================================================================
  function initCalculator() {
    const rentInput = document.getElementById('calcMonthlyRent');
    const endDateInput = document.getElementById('calcPeriodEnd');
    const outDateInput = document.getElementById('calcMoveOut');
    const prevMeterInput = document.getElementById('calcPrevMeter');
    const finalMeterInput = document.getElementById('calcFinalMeter');
    const elecRateInput = document.getElementById('calcElecRate');
    const advanceInput = document.getElementById('calcAdvance');
    const depositInput = document.getElementById('calcDeposit');

    if (!rentInput) return;

    const today = new Date();
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000);
    endDateInput.value = fiveDaysAgo.toISOString().split('T')[0];
    outDateInput.value = today.toISOString().split('T')[0];

    document.querySelectorAll('input[name="calcPolicy"]').forEach(r => {
      r.addEventListener('change', () => {
        document.querySelectorAll('.radio-toggle-label').forEach(l => l.classList.remove('active'));
        r.parentElement.classList.add('active');
        recalculateSettlement();
      });
    });

    [rentInput, endDateInput, outDateInput, prevMeterInput, finalMeterInput, elecRateInput, advanceInput, depositInput].forEach(inp => {
      if (inp) inp.addEventListener('input', recalculateSettlement);
    });

    recalculateSettlement();
  }

  function recalculateSettlement() {
    const rent = Math.max(0, parseFloat(document.getElementById('calcMonthlyRent')?.value) || 0);
    const endStr = document.getElementById('calcPeriodEnd')?.value || '';
    const outStr = document.getElementById('calcMoveOut')?.value || '';
    const prevM = Math.max(0, parseFloat(document.getElementById('calcPrevMeter')?.value) || 0);
    const finM = Math.max(prevM, parseFloat(document.getElementById('calcFinalMeter')?.value) || prevM);
    const rate = Math.max(0, parseFloat(document.getElementById('calcElecRate')?.value) || 10);
    const advance = Math.max(0, parseFloat(document.getElementById('calcAdvance')?.value) || 0);
    const deposit = Math.max(0, parseFloat(document.getElementById('calcDeposit')?.value) || 0);
    const policy = document.querySelector('input[name="calcPolicy"]:checked')?.value || 'fixed30';

    let extraDays = 0;
    if (endStr && outStr) {
      const dEnd = new Date(endStr);
      const dOut = new Date(outStr);
      const diffMs = dOut.getTime() - dEnd.getTime();
      if (diffMs > 0) extraDays = Math.round(diffMs / 86400000);
    }

    const divisor = policy === 'fixed30' ? 30 : 31;
    const dailyRate = rent > 0 ? (rent / divisor) : 0;
    const extraStayRent = Math.round(dailyRate * extraDays * 100) / 100;

    const elecUnits = Math.max(0, finM - prevM);
    const elecCharge = Math.round(elecUnits * rate * 100) / 100;

    const totalCharges = Math.round((extraStayRent + elecCharge) * 100) / 100;
    const deductions = advance + deposit;
    const netAmount = Math.round((totalCharges - deductions) * 100) / 100;

    updateText('summaryExtraDays', `${extraDays} day(s)`);
    updateText('summaryDailyRate', `₹${dailyRate.toFixed(2)}/day`);
    updateText('summaryExtraRent', `₹${extraStayRent.toFixed(2)}`);
    updateText('summaryElecUnits', `${elecUnits} units`);
    updateText('summaryElecCharge', `₹${elecCharge.toFixed(2)}`);
    updateText('summaryTotalCharges', `₹${totalCharges.toFixed(2)}`);
    updateText('summaryAdvanceAdjusted', `-₹${advance.toFixed(2)}`);
    updateText('summaryDepositAdjusted', `-₹${deposit.toFixed(2)}`);

    const netAmountEl = document.getElementById('summaryNetAmount');
    const netLabelEl = document.getElementById('summaryNetLabel');

    if (netAmountEl && netLabelEl) {
      if (netAmount > 0) {
        netLabelEl.textContent = 'AMOUNT PAYABLE BY TENANT';
        netLabelEl.style.color = '#EF4444';
        netAmountEl.textContent = `₹${Math.abs(netAmount).toFixed(2)}`;
        netAmountEl.style.color = '#EF4444';
      } else if (netAmount < 0) {
        netLabelEl.textContent = 'REFUNDABLE TO TENANT';
        netLabelEl.style.color = '#10B981';
        netAmountEl.textContent = `₹${Math.abs(netAmount).toFixed(2)}`;
        netAmountEl.style.color = '#10B981';
      } else {
        netLabelEl.textContent = 'ZERO BALANCE (FULLY SETTLED)';
        netLabelEl.style.color = '#6B7280';
        netAmountEl.textContent = `₹0.00`;
        netAmountEl.style.color = '#F9FAFB';
      }
    }
  }

  function updateText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ==========================================================================
  // 14. TOAST NOTIFICATIONS & MODAL CONTROLLERS
  // ==========================================================================
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    if (type === 'success') {
      icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    }

    toast.innerHTML = `<div>${icon}</div><div>${msg}</div>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  window.openModal = function (id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
  };

  window.closeModal = function (id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  };

  // ==========================================================================
  // 15. GLOBAL EVENT LISTENERS
  // ==========================================================================
  function setupEventListeners() {
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        applyTheme(state.theme === 'dark' ? 'light' : 'dark');
      });
    }

    const viewLanding = document.getElementById('viewSwitchLanding');
    if (viewLanding) viewLanding.addEventListener('click', () => switchView('landing'));

    const viewDash = document.getElementById('viewSwitchDashboard');
    if (viewDash) viewDash.addEventListener('click', () => openAppFromLanding());

    document.querySelectorAll('.launch-dashboard-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openAppFromLanding();
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.remove('active');
        }
      });
    });

    // ── Sticky Navbar: scroll-shadow enhancement ──────────────────────────────
    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
      const onScroll = () => {
        if (window.scrollY > 8) {
          siteHeader.classList.add('scrolled');
        } else {
          siteHeader.classList.remove('scrolled');
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll(); // run once on init to set correct state
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
