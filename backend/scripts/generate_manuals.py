"""Generate PayLock Pro user manuals as PDFs with screenshots."""
import os
from fpdf import FPDF

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
OUT_DIR = os.path.join(BACKEND_DIR, "static", "manuals")
IMG_DIR = os.path.join(OUT_DIR, "images")
os.makedirs(OUT_DIR, exist_ok=True)

BLUE = (14, 165, 233)
DARK = (15, 23, 42)
GRAY = (100, 116, 139)
WHITE = (255, 255, 255)
LIGHT_BG = (248, 250, 252)
GREEN = (16, 185, 129)
RED = (239, 68, 68)


class Manual(FPDF):
    title_text = ""

    def header(self):
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*GRAY)
        self.cell(0, 8, f"PayLock Pro  |  {self.title_text}", align="L")
        self.ln(10)
        self.set_draw_color(*BLUE)
        self.set_line_width(0.4)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*GRAY)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}  |  support@paylock.pro  |  paylock.pro", align="C")

    def cover(self, title, subtitle):
        self.add_page()
        self.ln(60)
        self.set_font("Helvetica", "B", 36)
        self.set_text_color(*DARK)
        self.cell(0, 16, "PayLock Pro", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(4)
        self.set_font("Helvetica", "B", 22)
        self.set_text_color(*BLUE)
        self.cell(0, 12, title, align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(6)
        self.set_font("Helvetica", "", 13)
        self.set_text_color(*GRAY)
        self.cell(0, 8, subtitle, align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(30)
        self.set_font("Helvetica", "", 10)
        self.cell(0, 6, "Version 1.2.3  |  March 2026", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 6, "PayLock Pro OU  |  Tallinn, Estonia, EU", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 6, "support@paylock.pro", align="C", new_x="LMARGIN", new_y="NEXT")

    def section(self, title):
        self.ln(6)
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(*DARK)
        self.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*BLUE)
        self.set_line_width(0.6)
        self.line(10, self.get_y(), 80, self.get_y())
        self.ln(4)

    def subsection(self, title):
        self.ln(3)
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(*BLUE)
        self.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def body(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*DARK)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def bullet(self, items):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*DARK)
        for item in items:
            x = self.get_x()
            self.cell(5, 5.5, "-")
            self.multi_cell(0, 5.5, f" {item}")
            self.set_x(x)
        self.ln(2)

    def numbered(self, items):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*DARK)
        for i, item in enumerate(items, 1):
            x = self.get_x()
            self.cell(7, 5.5, f"{i}.")
            self.multi_cell(0, 5.5, item)
            self.set_x(x)
        self.ln(2)

    def note(self, text):
        self.set_fill_color(239, 246, 255)
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(30, 64, 175)
        self.multi_cell(0, 5, f"  Note: {text}", fill=True)
        self.ln(3)

    def warning(self, text):
        self.set_fill_color(254, 242, 242)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(185, 28, 28)
        self.multi_cell(0, 5, f"  WARNING: {text}", fill=True)
        self.ln(3)

    def tip(self, text):
        self.set_fill_color(236, 253, 245)
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(5, 122, 85)
        self.multi_cell(0, 5, f"  Tip: {text}", fill=True)
        self.ln(3)

    def screenshot(self, img_name, caption="", width=80):
        """Insert a screenshot image with optional caption."""
        img_path = os.path.join(IMG_DIR, img_name)
        if not os.path.exists(img_path):
            self.set_font("Helvetica", "I", 9)
            self.set_text_color(*GRAY)
            self.cell(0, 6, f"[Screenshot: {caption or img_name}]", new_x="LMARGIN", new_y="NEXT")
            self.ln(2)
            return
        # Check if we need a new page for the image
        if self.get_y() > 180:
            self.add_page()
        # Center the image
        x_pos = (210 - width) / 2
        self.image(img_path, x=x_pos, w=width)
        if caption:
            self.ln(2)
            self.set_font("Helvetica", "I", 9)
            self.set_text_color(*GRAY)
            self.cell(0, 5, caption, align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

    def table_header(self, cols, widths):
        self.set_fill_color(*BLUE)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 9)
        for i, col in enumerate(cols):
            self.cell(widths[i], 7, col, border=1, fill=True, align="C")
        self.ln()
        self.set_text_color(*DARK)

    def table_row(self, cols, widths, fill=False):
        if fill:
            self.set_fill_color(*LIGHT_BG)
        self.set_font("Helvetica", "", 9)
        for i, col in enumerate(cols):
            self.cell(widths[i], 6, col, border=1, fill=fill, align="L")
        self.ln()


# ============================================================
# 1. ADMIN APP MANUAL
# ============================================================
def gen_admin():
    pdf = Manual()
    pdf.title_text = "Admin App User Manual"
    pdf.alias_nb_pages()
    pdf.cover("Admin App", "Complete User Manual")

    # TOC
    pdf.add_page()
    pdf.section("Table of Contents")
    pdf.numbered([
        "Getting Started & Login",
        "Dashboard Overview",
        "Client Management",
        "Loan Management",
        "Payment Tracking & Late Fees",
        "Device Lock & Unlock",
        "Reports & Analytics",
        "Document Vault",
        "Settings & User Management",
        "Team Management & Permissions",
        "Subscription Plans & Feature Tiers",
        "Advanced Features (Enterprise)",
        "Security & Tamper Detection",
        "Troubleshooting & FAQ",
    ])

    # Ch 1 - Getting Started
    pdf.add_page()
    pdf.section("1. Getting Started & Login")
    pdf.body("Download the PayLock Pro Admin app from Expo or install the APK provided by your administrator. The app is available for Android devices running Android 8.0 or later.")
    pdf.subsection("First-Time Setup")
    pdf.numbered([
        "Install the PayLock Pro Admin APK on your Android device.",
        "Open the app - you will see the login screen.",
        "Enter your username and password provided by your Super Admin.",
        "Tap 'Login' to access your dashboard.",
        "If you are the first user, your account is automatically a Super Admin with full access.",
    ])
    pdf.subsection("Staying Signed In")
    pdf.body("Toggle 'Stay signed in' on the login screen to remain logged in between app restarts. Your session token is stored securely on the device.")
    pdf.note("Passwords must be at least 6 characters. Contact your Super Admin if you forget your credentials. Sessions can be revoked remotely from the Settings page.")
    pdf.tip("Enable push notifications during setup to receive real-time alerts for payments, client activities, and security events.")

    # Ch 2 - Dashboard
    pdf.add_page()
    pdf.section("2. Dashboard Overview")
    pdf.body("The dashboard is your command center, displaying real-time metrics for your entire loan portfolio at a glance.")
    pdf.screenshot("admin_dashboard.png", "Admin Dashboard - Real-time portfolio overview", 70)
    pdf.subsection("Key Metrics")
    widths = [50, 70, 70]
    pdf.table_header(["Metric", "Description", "Action on Tap"], widths)
    pdf.table_row(["Total Clients", "Number of registered clients", "Opens client list"], widths)
    pdf.table_row(["Active Loans", "Currently active loan count", "Opens loan overview"], widths, True)
    pdf.table_row(["Monthly Collections", "Total collected this month", "Opens payment history"], widths)
    pdf.table_row(["Collection Rate", "% of payments received on time", "Opens analytics"], widths, True)
    pdf.table_row(["Interest Earned", "Total interest this month", "Opens financial report"], widths)
    pdf.table_row(["Overdue Amount", "Total overdue across clients", "Opens overdue clients"], widths, True)
    pdf.ln(2)
    pdf.subsection("Quick Actions")
    pdf.bullet([
        "Add Client - Create a new client record",
        "Record Payment - Quick payment entry",
        "Lock/Unlock Device - Immediate device control",
        "Send Reminder - Push notification to clients",
    ])
    pdf.body("The dashboard auto-refreshes every 30 seconds. Pull down to manually refresh.")

    # Ch 3 - Client Management
    pdf.add_page()
    pdf.section("3. Client Management")
    pdf.screenshot("admin_client_list.png", "Client List - Search and manage all clients", 70)
    pdf.subsection("Adding a New Client")
    pdf.numbered([
        "Navigate to the Clients tab in the bottom navigation.",
        "Tap the '+' button in the top right corner.",
        "Fill in required client details: full name, phone number.",
        "Optionally add: email address, physical address, ID number.",
        "Set the initial device token if provisioning a device.",
        "Tap 'Save' to create the client record.",
    ])
    pdf.subsection("Client Profile Details")
    pdf.body("Tap any client to view their comprehensive profile including:")
    pdf.bullet([
        "Contact information and identification details",
        "Device status (online/offline, locked/unlocked, last seen)",
        "Active loans with payment schedules and history",
        "GPS location history with map view (Professional+ plan)",
        "Document vault with uploaded files",
        "Credit score and risk assessment (Enterprise plan)",
        "In-app messaging and communication log",
        "Tamper detection alerts and security events",
    ])
    pdf.subsection("Searching & Filtering")
    pdf.body("Use the search bar at the top of the client list to find clients by name, phone number, or email. The list updates in real-time as you type.")
    pdf.subsection("Client Provisioning Methods")
    pdf.body("Register client devices using one of these methods:")
    pdf.bullet([
        "Manual Code: Client enters a 6-digit registration code in the Client app",
        "QR Code: Admin generates a QR code, client scans it (Enterprise)",
        "NFC Tap: Touch devices together for instant enrollment (Enterprise)",
    ])
    pdf.subsection("Bulk Import (Enterprise)")
    pdf.body("Enterprise users can import clients from CSV files. Go to Features > Bulk Import and upload a CSV with columns: name, phone, email, address. The system validates data before import and reports any errors.")

    # Ch 4 - Loan Management
    pdf.add_page()
    pdf.section("4. Loan Management")
    pdf.subsection("Creating a Loan")
    pdf.numbered([
        "Open a client's profile from the Clients tab.",
        "Tap 'New Loan' or the '+' button in the loans section.",
        "Select a pre-configured loan plan OR enter custom terms.",
        "Set the principal amount (loan size).",
        "Choose interest rate and calculation method (flat or day-count).",
        "Set loan duration and payment frequency (weekly, bi-weekly, monthly).",
        "Review the auto-generated EMI payment schedule.",
        "Tap 'Create Loan' to finalize.",
    ])
    pdf.subsection("Interest Calculation Methods")
    pdf.body("PayLock Pro supports two interest calculation methods:")
    pdf.bullet([
        "Flat Rate: Interest calculated on the full principal for the entire duration. Simple and predictable.",
        "Day-Count (Reducing Balance): Interest calculated on the outstanding balance. More fair for early repayments.",
    ])
    pdf.subsection("Loan Plans (Professional+)")
    pdf.body("Pre-configure loan templates under Features > Loan Plans. Each plan defines:")
    pdf.bullet([
        "Default interest rate and calculation method",
        "Standard duration and payment frequency",
        "Late fee rules and grace periods",
        "Auto-lock behavior settings",
    ])
    pdf.subsection("Loan Restructuring (Professional+)")
    pdf.body("For overdue or troubled loans, use the restructure option:")
    pdf.numbered([
        "Open the client's loan details.",
        "Tap 'Restructure Loan'.",
        "Modify terms: extend duration, adjust interest, change payment amount.",
        "Review the new payment schedule.",
        "Confirm restructuring. A new schedule is generated automatically.",
    ])
    pdf.note("Restructured loans are tracked separately in analytics for portfolio health monitoring.")

    # Ch 5 - Payment Tracking
    pdf.add_page()
    pdf.section("5. Payment Tracking & Late Fees")
    pdf.subsection("Recording a Payment")
    pdf.numbered([
        "Navigate to the Payments tab or open a client's loan details.",
        "Tap 'Record Payment'.",
        "Enter the payment amount received.",
        "Select the payment method (cash, bank transfer, mobile money, Stripe).",
        "Add optional notes or reference number.",
        "Tap 'Confirm' to record the payment.",
    ])
    pdf.body("The system automatically updates the loan balance, calculates remaining EMIs, and adjusts the device lock status if applicable.")
    pdf.subsection("Payment Reminders")
    pdf.body("Automated reminders are sent before each payment due date:")
    pdf.bullet([
        "Push notification: 3 days before due date",
        "Email reminder: 1 day before due date (if email configured)",
        "SMS reminder: On due date (add-on feature)",
        "Custom reminder schedules in Features > Payment Reminders",
    ])
    pdf.subsection("Late Fee Configuration")
    pdf.body("Configure late fees in Settings > Late Fee & Auto-lock:")
    pdf.bullet([
        "Late Fee Percentage: Applied as a % of the monthly payment amount",
        "Grace Period: Days after due date before fees apply (default: 3 days)",
        "Auto-Lock: Automatically lock device when payment is overdue past grace period",
        "Apply to All: Push settings to all existing clients at once",
    ])
    pdf.warning("Late fees compound if multiple payments are missed. Ensure clients are aware of fee structures.")
    pdf.subsection("Stripe Integration (Enterprise)")
    pdf.body("Enterprise users can accept online payments via Stripe. Clients receive a payment link and can pay directly with a credit/debit card. Payments are automatically reconciled.")

    # Ch 6 - Device Lock
    pdf.add_page()
    pdf.section("6. Device Lock & Unlock")
    pdf.body("The core feature of PayLock Pro - remotely lock client devices when payments are overdue.")
    pdf.subsection("Manual Lock")
    pdf.numbered([
        "Open the client's profile.",
        "Tap the 'Lock Device' button.",
        "Enter a custom lock message (displayed on the client's screen).",
        "Choose lock mode: Standard or Device Owner (Enterprise).",
        "Confirm the lock action.",
    ])
    pdf.body("The client's device will immediately display a full-screen lock message. The client can only make emergency calls (112/911).")
    pdf.subsection("Manual Unlock")
    pdf.numbered([
        "Open the locked client's profile.",
        "Tap 'Unlock Device'.",
        "The device unlocks immediately - client regains full access.",
    ])
    pdf.subsection("Auto-Lock Rules")
    pdf.body("Configure automatic locking in Settings or per-client:")
    pdf.bullet([
        "Grace Period: Days after missed payment before auto-lock triggers",
        "Auto-Lock Enabled: Toggle per client or globally",
        "Lock Escalation: Standard lock -> Device Owner lock (if applicable)",
    ])
    pdf.subsection("Device Lock Modes")
    widths2 = [40, 75, 75]
    pdf.table_header(["Mode", "Capabilities", "Requirement"], widths2)
    pdf.table_row(["Standard", "Lock screen, notification block, kiosk", "Device Admin permission"], widths2)
    pdf.table_row(["Device Owner", "Full control, app whitelist, factory reset protection", "ADB/QR provisioning"], widths2, True)
    pdf.ln(2)
    pdf.note("Device Owner mode provides the strongest protection and is recommended for high-value loans.")

    # Ch 7 - Reports
    pdf.add_page()
    pdf.section("7. Reports & Analytics")
    pdf.screenshot("admin_reports.png", "Reports - Financial analytics and data export", 70)
    pdf.body("Access comprehensive reports from Features > Reports.")
    pdf.subsection("Available Reports")
    pdf.bullet([
        "Financial Summary: Revenue, principal disbursed, interest earned, profit/loss",
        "Collection Trends: Payment rates over time with trend charts",
        "Client Health Scores: Risk distribution across your portfolio",
        "Monthly Interest Breakdown: Interest earned per client and loan",
        "Overdue Analysis: Days overdue distribution, recovery rates",
        "Collection Trends (Professional+): Detailed trend analysis with forecasting",
        "Revenue Forecasting (Enterprise): AI-predicted future collections",
        "Portfolio Health / NPA (Enterprise): Non-performing asset tracking",
        "Risk Score Distribution (Enterprise): Credit risk analytics",
        "Comparative Analytics (Enterprise): Period-over-period comparisons",
    ])
    pdf.subsection("Export Options")
    pdf.body("All reports can be exported in two formats:")
    pdf.bullet([
        "PDF: Formatted report with charts, suitable for sharing and printing",
        "CSV: Raw data export for custom analysis in Excel or other tools",
    ])
    pdf.subsection("Scheduled Reports (Enterprise)")
    pdf.body("Enterprise users can schedule automated email reports:")
    pdf.bullet([
        "Daily digest: Summary of previous day's activity",
        "Weekly report: Comprehensive weekly analytics",
        "Monthly report: Full monthly financial summary",
    ])

    # Ch 8 - Document Vault
    pdf.add_page()
    pdf.section("8. Document Vault (Enterprise)")
    pdf.body("Securely store client documents in the encrypted vault. Access it from a client's profile > Documents tab.")
    pdf.subsection("Uploading Documents")
    pdf.numbered([
        "Open a client's profile.",
        "Navigate to the Documents tab.",
        "Tap 'Upload' and select a file from your device (max 10MB).",
        "Choose the document type: ID photo, contract, proof of income, bank statement, or other.",
        "Add a description for easy identification.",
        "Tap 'Upload' - the file is encrypted and stored securely.",
    ])
    pdf.subsection("Supported File Types")
    pdf.bullet([
        "Images: JPG, PNG, HEIF",
        "Documents: PDF",
        "Maximum file size: 10MB per file",
    ])
    pdf.subsection("Bank Statement OCR (Enterprise)")
    pdf.body("Enterprise users can upload bank statements and use AI-powered OCR to automatically extract:")
    pdf.bullet([
        "Transaction history and patterns",
        "Income verification",
        "Balance trends",
        "Expense categorization",
    ])
    pdf.note("Documents are stored on the server with encryption at rest. Only authorized admins can view client documents.")

    # Ch 9 - Settings
    pdf.add_page()
    pdf.section("9. Settings & User Management")
    pdf.screenshot("admin_settings.png", "Settings - Account and team management", 70)
    pdf.subsection("Your Account")
    pdf.body("Manage your personal account from Settings:")
    pdf.bullet([
        "Edit Profile: Update your name, email, phone, and address",
        "Change Password: Update your login credentials (min 6 characters)",
        "Current Plan: View your subscription tier and features",
    ])
    pdf.subsection("User Management")
    pdf.body("Manage your team from Settings > User Management. The system enforces strict role-based access:")
    pdf.ln(1)
    widths3 = [35, 55, 55, 45]
    pdf.table_header(["Role", "Can Create", "Can Manage", "Sees"], widths3)
    pdf.table_row(["Super Admin", "Admins + Users", "Everyone", "All team members"], widths3)
    pdf.table_row(["Admin", "Users only", "Own created users", "Self + own users"], widths3, True)
    pdf.table_row(["Viewer", "Nobody", "Nobody", "Self only"], widths3)
    pdf.table_row(["Collections", "Nobody", "Nobody", "Self only"], widths3, True)
    pdf.ln(2)
    pdf.subsection("Creating a New User")
    pdf.numbered([
        "Go to Settings > User Management.",
        "Tap the '+' button.",
        "Fill in: First Name, Last Name, Username, Password.",
        "Select role: User (default) or Admin (Super Admin only).",
        "Tap 'Add' to create the account.",
    ])
    pdf.subsection("Changing a User's Plan")
    pdf.numbered([
        "Find the user in the User Management list.",
        "Tap the plan icon (tag icon) next to their name.",
        "Select the new plan: Starter, Professional, or Enterprise.",
        "The change takes effect immediately.",
    ])
    pdf.warning("Admins can only manage users they created. Super Admins can manage everyone.")
    pdf.subsection("Active Sessions (Enterprise)")
    pdf.body("Monitor and revoke active login sessions from Settings > Active Sessions. Each session shows login time, IP address, and device info. Revoke suspicious sessions immediately.")

    # Ch 10 - Team
    pdf.add_page()
    pdf.section("10. Team Management & Permissions")
    pdf.body("PayLock Pro uses a hierarchical permission system to ensure data security and proper access control.")
    pdf.subsection("Role Hierarchy")
    pdf.body("Permissions flow downward - each role includes all permissions of lower roles:")
    pdf.numbered([
        "Super Admin: Full system access. Can create/delete admins. Manages all users and plans. Access to audit logs, diagnostics, and all enterprise features.",
        "Full Admin: Can create users (not admins). Manages only users they created. Access to most features based on subscription plan.",
        "Collections: Can view clients and loans, record payments, send reminders. Cannot modify settings or manage team.",
        "Viewer: Read-only access to client data and reports. Cannot make any changes.",
    ])
    pdf.subsection("Enterprise Team Features")
    pdf.bullet([
        "Unlimited team members (Enterprise plan)",
        "Role-based permissions with granular control",
        "Audit log tracking all user actions",
        "Session management with remote revocation",
    ])

    # Ch 11 - Subscription Plans
    pdf.add_page()
    pdf.section("11. Subscription Plans & Feature Tiers")
    pdf.body("PayLock Pro offers three subscription tiers designed for different business sizes:")
    pdf.subsection("Starter ($29/month)")
    pdf.bullet(["Up to 25 clients", "Push notifications", "Basic analytics dashboard", "Email reminders", "Loan calculator", "1 admin user"])
    pdf.subsection("Professional ($79/month)")
    pdf.bullet(["Up to 200 clients", "Everything in Starter +", "Device lock & unlock", "Client messaging (Telegram, WhatsApp)", "PDF contract generation", "Automated payment scheduling", "Auto-lock after grace period", "Late fee automation", "Team management (3 members)", "GPS location tracking", "Advanced reports (PDF & CSV)", "Loan plans & restructuring", "Collection trends analysis"])
    pdf.subsection("Enterprise ($199/month)")
    pdf.bullet(["Unlimited clients & team members", "Everything in Professional +", "QR & NFC provisioning", "Device Owner mode (full device control)", "Bank statement OCR (AI-powered)", "Document vault with encryption", "Stripe payment integration", "Scheduled email reports", "Portfolio health & NPA tracking", "Risk score tracking & credit scoring", "Daily digest email", "Session management", "Role-based permissions & audit log", "Comparative analytics & revenue forecasting", "Bulk import/export", "Full REST API access", "Priority support with SLA"])
    pdf.subsection("Custom Plan")
    pdf.body("For large organizations with specific needs, contact sales@paylock.pro for a tailored plan with custom pricing, dedicated support, and white-label options.")

    # Ch 12 - Advanced
    pdf.add_page()
    pdf.section("12. Advanced Features (Enterprise)")
    pdf.subsection("Device Owner Mode")
    pdf.body("The most powerful device control mode. Requires ADB provisioning or factory reset with QR code. Enables:")
    pdf.bullet([
        "Factory reset protection - device cannot be reset without admin approval",
        "App whitelisting - only approved apps can run",
        "Custom launcher - PayLock becomes the default home screen",
        "Kiosk mode - device is restricted to a single app",
        "SIM lock - prevents SIM card changes",
    ])
    pdf.subsection("Credit Scoring")
    pdf.body("AI-powered credit scoring based on payment history, device usage patterns, and financial data. Scores update automatically and are visible in client profiles.")
    pdf.subsection("REST API Access")
    pdf.body("Full programmatic access to all PayLock features:")
    pdf.bullet([
        "Base URL: https://api.paylock.pro/api/",
        "Authentication: Token-based (via /api/admin/login)",
        "Full CRUD for clients, loans, and payments",
        "Device control endpoints",
        "Rate limit: 1000 requests/minute",
        "API docs: https://api.paylock.pro/api/docs",
    ])

    # Ch 13 - Security
    pdf.add_page()
    pdf.section("13. Security & Tamper Detection")
    pdf.body("PayLock Pro includes multiple layers of security to prevent tampering with the client app.")
    pdf.subsection("Permission Monitoring")
    pdf.body("The client app monitors all 8 critical permissions. If any permission is revoked via device settings:")
    pdf.numbered([
        "First detection: Full-screen Security Alert + push notification warning",
        "Second detection (permission still revoked): Tamper reported to server + device data wipe initiated",
    ])
    pdf.warning("Data wipe is irreversible. Ensure clients understand the consequences of tampering with app permissions.")
    pdf.subsection("Admin Mode Protection")
    pdf.body("If Device Admin mode is deactivated:")
    pdf.numbered([
        "Immediate Security Alert dialog appears",
        "Push notification sent",
        "If not re-enabled: tamper reported + factory reset",
    ])
    pdf.subsection("Additional Security Measures")
    pdf.bullet([
        "Screenshot blocking: Client app prevents screen capture",
        "Reboot detection: App re-locks device after reboot if payment is overdue",
        "Offline enforcement: Lock state persists even without internet",
        "Clear data protection: Client ID backed up externally, restored on data clear",
        "Foreground monitoring: Detects attempts to switch away from lock screen",
        "Status bar blocking: Prevents notification shade from being pulled down when locked",
    ])

    # Ch 14 - Troubleshooting
    pdf.add_page()
    pdf.section("14. Troubleshooting & FAQ")
    pdf.subsection("Cannot Login")
    pdf.bullet(["Verify username and password are correct (case-sensitive).", "Check internet connection.", "If locked out, contact your Super Admin to reset your password.", "Check if your session was revoked in Active Sessions."])
    pdf.subsection("Device Not Responding to Lock/Unlock")
    pdf.bullet(["Verify the client device has PayLock Client app installed.", "Check that the device has internet connectivity.", "Ensure all 8 permissions are granted on the client device.", "Check device admin is active on the client device.", "Try sending a push notification to verify connectivity.", "If using Device Owner mode, verify ADB provisioning was completed."])
    pdf.subsection("Payments Not Syncing")
    pdf.bullet(["Pull down to refresh the dashboard.", "Check your internet connection.", "Verify the payment was recorded correctly.", "Check the audit log for any errors."])
    pdf.subsection("Contact Support")
    pdf.body("Email: support@paylock.pro\nWebsite: https://paylock.pro/contact\n\nResponse times:\n- Starter: Within 48 hours\n- Professional: Within 24 hours\n- Enterprise: Within 4 hours (SLA)")

    pdf.output(os.path.join(OUT_DIR, "PayLockPro_Admin_Manual.pdf"))
    print("Admin manual generated with screenshots.")


# ============================================================
# 2. CLIENT APP MANUAL
# ============================================================
def gen_client():
    pdf = Manual()
    pdf.title_text = "Client App User Manual"
    pdf.alias_nb_pages()
    pdf.cover("Client App", "Complete User Manual")

    pdf.add_page()
    pdf.section("Table of Contents")
    pdf.numbered([
        "Introduction",
        "Installation & Setup",
        "Registration Process",
        "Granting Permissions",
        "Understanding the Home Screen",
        "Payment Information",
        "Device Lock & What to Expect",
        "In-App Messaging",
        "Security & Protection",
        "FAQ & Troubleshooting",
    ])

    # Ch 1
    pdf.add_page()
    pdf.section("1. Introduction")
    pdf.body("The PayLock Pro Client app is installed on your device as part of a loan agreement with your lender. This manual explains how the app works, what permissions it needs, and what happens during the loan period.")
    pdf.subsection("What the App Does")
    pdf.bullet([
        "Displays your loan status and payment information",
        "Sends payment reminders before due dates",
        "Allows your lender to manage device access based on payment status",
        "Tracks device location for compliance purposes",
        "Enables secure communication with your lender",
    ])
    pdf.subsection("What the App Does NOT Do")
    pdf.bullet([
        "Does not access your personal files, photos, or messages",
        "Does not record audio or video",
        "Does not share your data with third parties",
        "Does not charge you any fees",
    ])
    pdf.note("The app requires certain permissions to function properly. These permissions are part of your loan agreement and cannot be changed while the loan is active.")

    # Ch 2
    pdf.add_page()
    pdf.section("2. Installation & Setup")
    pdf.body("Your lender will provide you with the app installation in one of these ways:")
    pdf.subsection("Installation Methods")
    pdf.bullet([
        "Direct APK: Your lender sends you a download link. Tap to install.",
        "QR Code Scan: Your lender shows you a QR code. Scan it with your camera to begin setup.",
        "NFC Tap: Touch your device to your lender's device for instant enrollment.",
    ])
    pdf.subsection("System Requirements")
    pdf.bullet([
        "Android 8.0 (Oreo) or later",
        "Active internet connection (WiFi or mobile data)",
        "At least 100MB free storage space",
    ])
    pdf.warning("Do not uninstall or disable the app without your lender's permission. Tampering with the app may result in data loss.")

    # Ch 3
    pdf.section("3. Registration Process")
    pdf.numbered([
        "Open the app after installation.",
        "You will see the registration screen.",
        "Enter the activation code provided by your lender.",
        "Your name and loan details will appear for confirmation.",
        "Tap 'Register' to complete activation.",
        "The app will guide you through permission setup.",
    ])
    pdf.note("Keep your activation code safe. You may need it if you reset your device.")

    # Ch 4
    pdf.add_page()
    pdf.section("4. Granting Permissions")
    pdf.screenshot("client_home_screen.png", "Permission Setup - Grant all 8 required permissions", 70)
    pdf.body("After registration, the app requires 8 permissions for proper operation. Each permission card on the screen shows its status (green = granted, red = not granted).")
    pdf.subsection("Permission Details")
    pdf.ln(1)
    widths4 = [40, 75, 75]
    pdf.table_header(["Permission", "Why It's Needed", "How to Grant"], widths4)
    pdf.table_row(["Battery", "Keeps app running in background", "Tap card > Allow unrestricted"], widths4)
    pdf.table_row(["Overlay", "Shows lock screen & reminders", "Tap card > Toggle ON"], widths4, True)
    pdf.table_row(["Auto Start", "Restarts app after device reboot", "Tap card > Follow instructions"], widths4)
    pdf.table_row(["Accessibility", "Enables device management", "Tap card > Enable service"], widths4, True)
    pdf.table_row(["Location", "Compliance monitoring", "Tap card > Allow Always"], widths4)
    pdf.table_row(["Notification", "Receives payment reminders", "Tap card > Allow"], widths4, True)
    pdf.table_row(["Usage Stats", "Security monitoring", "Tap card > Toggle ON"], widths4)
    pdf.table_row(["Notif. Listener", "Ensures alerts aren't dismissed", "Tap card > Enable"], widths4, True)
    pdf.ln(2)
    pdf.subsection("Device Admin Activation")
    pdf.body("After all 8 permissions are granted, the app will ask you to activate Device Admin mode. This is the final step:")
    pdf.numbered([
        "A dialog appears asking to enable Device Admin.",
        "Tap 'Yes, Enable' to activate.",
        "The app confirms activation with a green checkmark.",
        "Setup is complete - the app runs in the background.",
    ])
    pdf.warning("Once permissions are locked by your lender, attempting to disable them from device settings will trigger a security alert. If permissions remain disabled, your device data will be wiped.")

    # Ch 5
    pdf.add_page()
    pdf.section("5. Understanding the Home Screen")
    pdf.body("After setup is complete, the home screen shows your current status:")
    pdf.subsection("Status Indicators")
    pdf.bullet([
        "Welcome Message: Your name and account status",
        "Protection Status: Green shield = fully protected, Yellow = permissions missing",
        "Device Status: Shows if your device is currently locked or unlocked",
        "Loan Information: Next payment date, amount due, total remaining",
        "Warning Messages: Important notices from your lender (auto-dismiss after 10 seconds)",
    ])
    pdf.subsection("Pull to Refresh")
    pdf.body("Swipe down on the home screen to manually refresh your status. The app also auto-refreshes every 5 seconds.")
    pdf.subsection("Language Selection")
    pdf.body("Change the app language using the language picker in the top right corner. Available languages: English, Estonian, Russian.")

    # Ch 6
    pdf.section("6. Payment Information")
    pdf.body("The home screen displays your loan status:")
    pdf.bullet([
        "Loan Amount: Total loan principal",
        "Outstanding Balance: Remaining amount to pay",
        "Monthly EMI: Your regular payment amount",
        "Next Due Date: When your next payment is expected",
    ])
    pdf.body("Make payments directly to your lender using their specified method (cash, bank transfer, mobile money). Once your lender records the payment, your status updates automatically within minutes.")
    pdf.tip("Pay on time to avoid device locking and late fees. Set a personal reminder for 2-3 days before your due date.")

    # Ch 7
    pdf.add_page()
    pdf.section("7. Device Lock & What to Expect")
    pdf.screenshot("client_lock_screen.png", "Lock Screen - Displayed when payment is overdue", 70)
    pdf.body("If a payment is overdue past the grace period, your lender may lock your device. Here's what happens:")
    pdf.subsection("When Your Device is Locked")
    pdf.bullet([
        "A full-screen lock message appears - you cannot use other apps",
        "Your lender's custom message explains the reason",
        "Pending payment amount and due date are displayed",
        "Status bar and navigation are blocked",
        "You CAN still make emergency calls (112/911) via the button at the bottom",
    ])
    pdf.subsection("How to Unlock")
    pdf.numbered([
        "Contact your lender to arrange payment.",
        "Make the required payment.",
        "Your lender confirms payment receipt in their system.",
        "Your device unlocks automatically within minutes.",
    ])
    pdf.subsection("Temporary Unlock")
    pdf.body("In some cases, your lender may grant a temporary unlock while payment is being processed. Contact your lender to request this.")
    pdf.warning("Do not try to force-restart your device to bypass the lock. The lock persists across reboots and even works offline.")

    # Ch 8
    pdf.add_page()
    pdf.section("8. In-App Messaging")
    pdf.body("If your lender has enabled messaging, you can communicate directly through the app:")
    pdf.numbered([
        "Tap the chat icon on the home screen.",
        "Type your message in the text field.",
        "Tap 'Send' to deliver the message.",
        "Your lender will see the message and can respond.",
    ])
    pdf.body("Messages are stored on the server and synchronized across sessions. Your lender may also communicate via Telegram or WhatsApp if configured.")

    # Ch 9
    pdf.section("9. Security & Protection")
    pdf.body("The app includes several security features to ensure the loan agreement is maintained:")
    pdf.subsection("Permission Monitoring")
    pdf.body("The app monitors all granted permissions. If you navigate to device settings and disable any permission:")
    pdf.numbered([
        "A full-screen Security Alert dialog appears immediately.",
        "A push notification is sent as a warning.",
        "You should re-enable the permission immediately.",
        "If the permission remains disabled, a data wipe will be triggered.",
    ])
    pdf.subsection("What Triggers Security Alerts")
    pdf.bullet([
        "Disabling any of the 8 required permissions",
        "Deactivating Device Admin mode",
        "Attempting to uninstall the app (when blocked)",
        "Clearing app data or cache",
        "Factory resetting the device (Device Owner mode prevents this)",
    ])
    pdf.warning("Tampering with the app or its permissions will result in a security response including potential data wipe. Always contact your lender before making any changes.")

    # Ch 10
    pdf.add_page()
    pdf.section("10. FAQ & Troubleshooting")
    pdf.subsection("Can I uninstall the app?")
    pdf.body("The app can only be uninstalled with your lender's permission. Contact your lender to discuss uninstallation after your loan is fully repaid.")
    pdf.subsection("My device is locked but I made a payment")
    pdf.body("Contact your lender to confirm payment receipt. Once confirmed, your device will be unlocked within minutes automatically.")
    pdf.subsection("The app is draining my battery")
    pdf.body("The app is optimized for minimal battery usage (less than 2% per day). If you experience issues, ensure battery optimization exemption is granted (this is one of the 8 permissions). Do not force-stop the app as it needs to run in background.")
    pdf.subsection("I'm not receiving notifications")
    pdf.body("Check that notification permissions are granted in both the app and device settings. Ensure the app is not being killed by your device's battery saver. Some Chinese manufacturers (Huawei, Xiaomi, Oppo) have aggressive battery management - follow the Auto Start permission instructions.")
    pdf.subsection("I changed phones")
    pdf.body("Contact your lender. They will need to:")
    pdf.numbered([
        "Remove the old device from your account.",
        "Provide a new activation code for your new phone.",
        "Help you set up the app on the new device.",
    ])
    pdf.subsection("The app crashed")
    pdf.body("If the app crashes, it will restart automatically. If it keeps crashing:")
    pdf.bullet([
        "Restart your device",
        "Check for app updates from your lender",
        "Contact your lender for a replacement APK if needed",
    ])
    pdf.subsection("Contact Support")
    pdf.body("For technical issues: support@paylock.pro\nFor payment issues: Contact your lender directly\n\nWhen reporting issues, please provide: your name, lender name, device model, and a description of the problem.")

    pdf.output(os.path.join(OUT_DIR, "PayLockPro_Client_Manual.pdf"))
    print("Client manual generated with screenshots.")


# ============================================================
# 3. WEB PORTAL MANUAL
# ============================================================
def gen_portal():
    pdf = Manual()
    pdf.title_text = "Web Portal User Manual"
    pdf.alias_nb_pages()
    pdf.cover("Web Portal", "Complete User Manual")

    pdf.add_page()
    pdf.section("Table of Contents")
    pdf.numbered([
        "Accessing the Portal",
        "Dashboard Overview",
        "Client Management",
        "Loan Management",
        "Payment Processing",
        "Device Management",
        "Reports & Exports",
        "Settings & Administration",
        "API Access (Enterprise)",
        "Keyboard Shortcuts & Tips",
    ])

    # Ch 1
    pdf.add_page()
    pdf.section("1. Accessing the Portal")
    pdf.body("The PayLock Pro Web Portal provides full access to all features through a web browser.")
    pdf.subsection("Login")
    pdf.numbered([
        "Open your web browser (Chrome, Firefox, Safari, or Edge).",
        "Navigate to: https://api.paylock.pro/api/portal",
        "Enter your admin username and password.",
        "Click 'Login' to access the dashboard.",
    ])
    pdf.subsection("Supported Browsers")
    pdf.bullet([
        "Google Chrome 90+ (recommended)",
        "Mozilla Firefox 90+",
        "Safari 15+",
        "Microsoft Edge 90+",
    ])
    pdf.note("The web portal uses the same credentials as the mobile admin app. All data is synchronized in real-time across both platforms.")
    pdf.tip("Bookmark the portal URL for quick access. You can also create a home screen shortcut on mobile browsers.")

    # Ch 2
    pdf.add_page()
    pdf.section("2. Dashboard Overview")
    pdf.screenshot("portal_dashboard.png", "Web Portal Dashboard - Comprehensive portfolio view", 160)
    pdf.body("The web dashboard provides a comprehensive, at-a-glance view of your loan portfolio with interactive charts and real-time data.")
    pdf.subsection("Dashboard Components")
    pdf.bullet([
        "Metric Cards: Total clients, active loans, overdue accounts, monthly revenue",
        "Revenue Chart: Interactive line chart showing monthly collections trend",
        "Collection Rate: Visual gauge showing on-time payment percentage",
        "Recent Activity: Live feed of latest payments, client registrations, and device events",
        "Quick Actions: Buttons for common tasks (Add Client, Record Payment, Generate Report)",
        "Device Status Summary: Count of online, offline, and locked devices",
    ])

    # Ch 3
    pdf.section("3. Client Management")
    pdf.screenshot("portal_client_detail.png", "Client Detail Page - Full client profile and controls", 160)
    pdf.subsection("Adding Clients")
    pdf.numbered([
        "Click 'Add Client' from the sidebar or dashboard quick action.",
        "Fill in the client form: name (required), phone (required), email, address.",
        "Optionally set initial device token for provisioning.",
        "Click 'Create Client' to save.",
    ])
    pdf.subsection("Client Search & Filters")
    pdf.body("Use the powerful search and filter system to find clients quickly:")
    pdf.bullet([
        "Text search: Name, phone number, or email",
        "Status filter: Active, Locked, Overdue, Completed",
        "Sort by: Name, loan amount, last payment, registration date",
    ])
    pdf.subsection("Client Profile Actions")
    pdf.body("From a client's profile page, you can:")
    pdf.bullet([
        "View and edit contact information",
        "Create new loans or modify existing ones",
        "Record payments and view full payment history",
        "Lock/unlock their device remotely with custom messages",
        "Upload documents to their encrypted vault",
        "View GPS location history on an interactive map",
        "Send messages via in-app chat, Telegram, or WhatsApp",
        "View credit score and risk assessment",
        "Access tamper detection logs and security events",
    ])

    # Ch 4
    pdf.add_page()
    pdf.section("4. Loan Management")
    pdf.subsection("Creating a Loan")
    pdf.numbered([
        "Navigate to a client's profile.",
        "Click 'Create Loan' in the loans section.",
        "Select a pre-configured loan plan or enter custom terms.",
        "Set principal amount, interest rate, and calculation method.",
        "Choose duration and payment frequency.",
        "Review the auto-generated EMI payment schedule.",
        "Click 'Create' to finalize the loan.",
    ])
    pdf.subsection("Loan Status Tracking")
    widths5 = [35, 75, 80]
    pdf.table_header(["Status", "Description", "Actions Available"], widths5)
    pdf.table_row(["Active", "Loan is current, payments on time", "Record payment, modify terms"], widths5)
    pdf.table_row(["Overdue", "One or more payments past due", "Record payment, lock device, send reminder"], widths5, True)
    pdf.table_row(["Defaulted", "Multiple missed payments", "Restructure, escalate, legal action"], widths5)
    pdf.table_row(["Completed", "Loan fully repaid", "Generate completion certificate"], widths5, True)
    pdf.table_row(["Restructured", "Terms have been modified", "Track new schedule"], widths5)
    pdf.ln(2)

    # Ch 5
    pdf.section("5. Payment Processing")
    pdf.body("Record and track payments through the web portal.")
    pdf.subsection("Recording Payments")
    pdf.numbered([
        "Navigate to Payments section or client's loan view.",
        "Click 'Record Payment'.",
        "Enter amount, select payment method, add reference number.",
        "Click 'Confirm' to save.",
    ])
    pdf.subsection("Payment Methods Supported")
    pdf.bullet([
        "Cash: Manual recording with optional receipt",
        "Bank Transfer: Record with transaction reference",
        "Stripe: Online card payment with automatic reconciliation (Enterprise)",
        "Mobile Money: Record with provider reference",
    ])

    # Ch 6
    pdf.add_page()
    pdf.section("6. Device Management")
    pdf.subsection("Lock/Unlock Controls")
    pdf.body("Manage client devices directly from the web portal:")
    pdf.numbered([
        "Go to a client's profile.",
        "Click 'Lock Device' or 'Unlock Device'.",
        "For locking: Enter a custom message that will display on the client's screen.",
        "Confirm the action.",
    ])
    pdf.subsection("Auto-Lock Configuration")
    pdf.body("Set up automatic device locking rules:")
    pdf.bullet([
        "Grace period: Days after missed payment before auto-lock",
        "Lock message template: Default message for auto-locked devices",
        "Escalation rules: Standard lock to Device Owner lock",
        "Bulk lock/unlock: Manage multiple devices simultaneously",
    ])
    pdf.subsection("Device Monitoring")
    pdf.body("The portal shows real-time device status:")
    pdf.bullet([
        "Online/Offline indicator with last seen timestamp",
        "Lock status (locked/unlocked)",
        "Admin mode status (active/inactive)",
        "Permission compliance (all permissions granted?)",
        "Last GPS location on map",
        "Tamper detection events log",
    ])

    # Ch 7
    pdf.add_page()
    pdf.section("7. Reports & Exports")
    pdf.body("Generate comprehensive reports from the Reports section in the sidebar.")
    pdf.subsection("Report Types")
    pdf.bullet([
        "Financial Summary: Revenue, principal disbursed, interest earned, profit/loss",
        "Collection Trends: Payment rates and trends over time",
        "Client Analytics: Health scores, risk distribution, demographics",
        "Portfolio Health: NPA ratios, risk scoring, exposure analysis (Enterprise)",
        "Revenue Forecast: AI-predicted future collections (Enterprise)",
        "Comparative Analytics: Period-over-period comparisons (Enterprise)",
    ])
    pdf.subsection("Export Formats")
    pdf.bullet([
        "PDF: Formatted reports with charts and summaries",
        "CSV: Raw data for Excel, Google Sheets, or custom analysis",
    ])
    pdf.subsection("Scheduled Reports (Enterprise)")
    pdf.body("Set up automated email reports delivered to your inbox:")
    pdf.bullet([
        "Daily digest: Previous day's summary",
        "Weekly report: Week's comprehensive analytics",
        "Monthly report: Full monthly financial summary with comparisons",
    ])

    # Ch 8
    pdf.add_page()
    pdf.section("8. Settings & Administration")
    pdf.subsection("User Management")
    pdf.body("Manage your team from the Settings page:")
    pdf.bullet([
        "Create new team members with specific roles",
        "Change user plans (Starter/Professional/Enterprise)",
        "Deactivate or delete accounts",
        "Monitor active sessions and revoke unauthorized access",
    ])
    pdf.subsection("Permission Model")
    pdf.body("The web portal enforces the same permission model as the mobile app:")
    pdf.bullet([
        "Super Admins: Full access, can manage all users and admins",
        "Admins: Can create and manage only users they created",
        "Viewers: Read-only access to assigned data",
        "Collections: Can view clients and record payments",
    ])
    pdf.subsection("Late Fee & Auto-Lock Settings")
    pdf.body("Configure global defaults that apply to all new clients:")
    pdf.bullet([
        "Late fee percentage (% of monthly payment)",
        "Grace period days (before late fee applies)",
        "Auto-lock enabled/disabled toggle",
        "'Apply to All' button to push settings to existing clients",
    ])
    pdf.subsection("Subscription Management")
    pdf.body("View and upgrade your subscription plan from Settings > Plans & Pricing. Payments are processed securely through Stripe.")

    # Ch 9
    pdf.add_page()
    pdf.section("9. API Access (Enterprise)")
    pdf.body("Enterprise customers have full REST API access for custom integrations and automation.")
    pdf.subsection("Getting Started")
    pdf.numbered([
        "Obtain your API token by logging in via POST /api/admin/login",
        "Include the token in requests as admin_token query parameter",
        "Use the base URL: https://api.paylock.pro/api/",
        "Refer to API docs at: https://api.paylock.pro/api/docs",
    ])
    pdf.subsection("Available Endpoints")
    widths6 = [30, 60, 100]
    pdf.table_header(["Method", "Endpoint", "Description"], widths6)
    pdf.table_row(["POST", "/api/admin/login", "Authenticate and get token"], widths6)
    pdf.table_row(["GET", "/api/clients", "List all clients"], widths6, True)
    pdf.table_row(["POST", "/api/clients", "Create a new client"], widths6)
    pdf.table_row(["GET", "/api/clients/{id}", "Get client details"], widths6, True)
    pdf.table_row(["POST", "/api/loans", "Create a new loan"], widths6)
    pdf.table_row(["POST", "/api/payments", "Record a payment"], widths6, True)
    pdf.table_row(["POST", "/api/device/lock", "Lock a device"], widths6)
    pdf.table_row(["POST", "/api/device/unlock", "Unlock a device"], widths6, True)
    pdf.table_row(["GET", "/api/analytics/*", "Access analytics data"], widths6)
    pdf.ln(2)
    pdf.note("Rate limit: 1000 requests per minute. Contact support for higher limits.")

    # Ch 10
    pdf.section("10. Keyboard Shortcuts & Tips")
    pdf.subsection("Productivity Tips")
    pdf.bullet([
        "Use browser bookmarks for quick access to specific client profiles",
        "Right-click client names to open in new tab for comparison",
        "Use Ctrl+F to search within any page",
        "Export reports regularly for offline backup",
        "Set up scheduled reports to stay informed without logging in",
    ])
    pdf.subsection("Mobile Access")
    pdf.body("The web portal is fully responsive and works on mobile browsers. Add it to your home screen for app-like access when the admin app is not available.")

    pdf.output(os.path.join(OUT_DIR, "PayLockPro_WebPortal_Manual.pdf"))
    print("Web Portal manual generated with screenshots.")


if __name__ == "__main__":
    gen_admin()
    gen_client()
    gen_portal()
    print(f"\nAll manuals saved to {OUT_DIR}/")
