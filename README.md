# Rentora - Rental Property Management Ecosystem

Rentora is a complete rental property management platform designed for landlords and tenants with real-time Firebase backend, automated billing calculations, payment verification workflows, and Firebase Cloud Messaging (FCM) push notifications.

## Project Structure

```
Rentora/
├── Rentora Landload/    # Rentora Landlord Mobile Application (Expo / React Native)
│   ├── app/             # Screens & Expo Router navigation
│   ├── android/         # Android native source project
│   ├── components/      # UI components & design system
│   ├── services/        # Firestore, Auth, Notifications & Billing services
│   └── types/           # TypeScript interfaces & types
│
└── RentoraTenant/       # Rentora Tenant Mobile Application & Cloud Backend
    ├── app/             # Screens & Expo Router navigation
    ├── android/         # Android native source project
    ├── context/         # Auth & Theme context providers
    ├── functions/       # Firebase Cloud Functions (FCM push triggers)
    ├── services/        # Tenant data, bills & notification services
    └── types/           # TypeScript interfaces & types
```

## Features

- **Firebase Cloud Messaging (FCM)**: Native Android push notifications for payment submissions, approvals, rejections, new bills, and rent due reminders.
- **In-App Notification Center**: Synchronized notifications with read/unread tracking and tap navigation.
- **Oldest-First Payment Allocation**: Automatic chronological due clearance.
- **Payment Verification**: Landlord verification system for tenant payment submissions.
- **Multi-Tenant & Multi-Landlord Isolation**: Secure tenant-to-landlord ownership mapping.

## Technology Stack

- **Frontend**: React Native, Expo SDK 57, TypeScript, Expo Router
- **Backend & Database**: Firebase Firestore, Firebase Authentication, Firebase Cloud Functions
- **Notifications**: Firebase Cloud Messaging (FCM), Expo Notifications
