"""Generate PayLock Pro user manuals as PDFs with real screenshots."""
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
        self.cell(0, 6, "Version 1.2.4  |  March 2026", align="C", new_x="LMARGIN", new_y="NEXT")
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

    def screenshot(self, img_name, caption="", width=70):
        img_path = os.path.join(IMG_DIR, img_name)
        if not os.path.exists(img_path):
            self.set_font("Helvetica", "I", 9)
            self.set_text_color(*GRAY)
            self.cell(0, 6, f"[Screenshot: {caption or img_name}]", new_x="LMARGIN", new_y="NEXT")
            self.ln(2)
            return
        if self.get_y() > 140:
            self.add_page()
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
# ADMIN APP MANUAL - with 19 real screenshots
# ============================================================
def gen_admin():
    pdf = Manual()
    pdf.title_text = "Admin App User Manual"
    pdf.alias_nb_pages()
    pdf.cover("Admin App", "Complete User Manual with Screenshots")

    # TOC
    pdf.add_page()
    pdf.section("Table of Contents")
    pdf.numbered([
        "Getting Started & Login",
        "Dashboard Overview",
        "Loans Management",
        "Transactions & Payments",
        "Features & Analytics",
        "Reports & Analytics",
        "Bank Statement Analyzer",
        "Audit Log",
        "Revenue Forecasting",
        "Loan Plans & Calculator",
        "Bulk Import & Documents",
        "Device Management",
        "Client Management",
        "Payment Reminders",
        "Settings & User Management",
        "Subscription Plans",
        "Security & Tamper Detection",
        "Troubleshooting",
    ])

    # Ch 1 - Getting Started
    pdf.add_page()
    pdf.section("1. Getting Started & Login")
    pdf.body("Download the PayLock Pro Admin app from Expo or install the APK provided by your administrator. The app is available for Android 8.0+.")
    pdf.subsection("First-Time Setup")
    pdf.numbered([
        "Install the PayLock Pro Admin APK on your Android device.",
        "Open the app - you will see the login screen.",
        "Enter your username and password provided by your Super Admin.",
        "Tap 'Login' to access your dashboard.",
        "If you are the first user, your account automatically becomes Super Admin.",
    ])
    pdf.note("Passwords must be at least 6 characters. Contact your Super Admin if you forget credentials.")

    # Ch 2 - Dashboard
    pdf.add_page()
    pdf.section("2. Dashboard Overview")
    pdf.body("The dashboard is your command center, showing real-time portfolio metrics at a glance.")
    pdf.screenshot("screenshot_091727.jpg", "Figure 2.1: Dashboard - Loan Overview (top section)", 65)
    pdf.body("The top section displays key metrics: Welcome back message, Active Loans count, Overdue clients, Completed loans, Total Collected amount, and Collection Rate percentage.")
    pdf.screenshot("screenshot_091821.jpg", "Figure 2.2: Dashboard - Charts & Interest (scrolled down)", 65)
    pdf.body("Scrolling down reveals Interest Earned total, Loans Archived count, Device Heartbeat status, Monthly Interest Income chart, and Monthly Revenue chart showing 6-month trends.")
    pdf.subsection("Key Metrics Explained")
    w = [50, 70, 70]
    pdf.table_header(["Metric", "Description", "Action on Tap"], w)
    pdf.table_row(["Active Loans", "Currently active loan count", "Opens loan overview"], w)
    pdf.table_row(["Overdue", "Clients past payment due date", "Opens overdue list"], w, True)
    pdf.table_row(["Collection Rate", "% payments received on time", "Opens analytics"], w)
    pdf.table_row(["Interest Earned", "Total interest from all loans", "Shows breakdown"], w, True)
    pdf.table_row(["Monthly Revenue", "Revenue trend over 6 months", "Interactive chart"], w)
    pdf.ln(2)
    pdf.note("Each admin sees ONLY their own clients' data on the dashboard. Super admins can use filter_admin_id=all to see enterprise-wide data.")

    # Ch 3 - Loans
    pdf.add_page()
    pdf.section("3. Loans Management")
    pdf.screenshot("screenshot_091835.jpg", "Figure 3.1: Loans List with Given/Archived filter", 65)
    pdf.body("The Loans tab shows all loans with filter options: 'Given' (active loans) and 'Archived' (completed/paid loans). Each loan card displays client name, amount, status, and progress.")
    pdf.subsection("Creating a Loan")
    pdf.numbered([
        "Open a client's profile from the Clients tab.",
        "Tap 'New Loan' or the '+' button.",
        "Set principal amount, interest rate, and duration.",
        "Choose interest calculation: Flat Rate or Day-Count (reducing balance).",
        "Set payment frequency: weekly, bi-weekly, or monthly.",
        "Review the auto-generated EMI schedule.",
        "Tap 'Create Loan' to finalize.",
    ])
    pdf.subsection("Loan Restructuring (Professional+)")
    pdf.body("For overdue loans, open the loan details and tap 'Restructure'. Modify terms: extend duration, adjust interest, or change payment amounts. A new schedule is generated automatically.")

    # Ch 4 - Transactions
    pdf.add_page()
    pdf.section("4. Transactions & Payments")
    pdf.screenshot("screenshot_091845.jpg", "Figure 4.1: Transactions with All/Disbursements/Payments filters", 65)
    pdf.body("The Transactions tab provides a complete financial history with filter tabs: All, Disbursements (loans given), and Payments (received). Each transaction shows date, amount, client, and type.")
    pdf.subsection("Recording a Payment")
    pdf.numbered([
        "Navigate to Transactions tab or open a client's loan.",
        "Tap 'Record Payment'.",
        "Enter amount received and payment method (cash, bank transfer, mobile money, Stripe).",
        "Add optional notes or reference number.",
        "Tap 'Confirm' - balance updates automatically.",
    ])
    pdf.tip("The system automatically adjusts remaining EMIs and device lock status after payment recording.")

    # Ch 5 - Features
    pdf.add_page()
    pdf.section("5. Features & Analytics")
    pdf.screenshot("features_top.jpg", "Figure 5.1: Features - Analytics section", 65)
    pdf.body("The Features tab organizes all tools by category. The Analytics section includes Reports, Bank Statement Analyzer, Full Audit Log, and Revenue Forecasting. Features are gated by subscription plan.")
    pdf.screenshot("features_admin.jpg", "Figure 5.2: Features - Administration section", 65)
    pdf.body("The Administration section includes Settings, Team Management, Session Management, and Logout. Each feature shows which plan is required (Starter/Professional/Enterprise).")

    # Ch 6 - Reports
    pdf.add_page()
    pdf.section("6. Reports & Analytics")
    pdf.screenshot("reports_analytics.jpg", "Figure 6.1: Reports & Analytics dashboard", 65)
    pdf.body("The Reports screen provides comprehensive financial analytics including:")
    pdf.bullet([
        "Profit Summary: Total revenue, expenses, and net profit",
        "Advanced Metrics: Portfolio health indicators and KPIs",
        "Bad Loans: Non-performing assets and default tracking",
        "Collection Overview: Payment collection rates and trends",
        "Financial Breakdown: Detailed income vs. expense analysis",
        "6-Month Revenue Trend: Visual chart showing monthly revenue",
    ])
    pdf.subsection("Export Options")
    pdf.body("All reports can be exported as PDF (formatted with charts) or CSV (raw data for Excel analysis).")

    # Ch 7 - Bank Statement
    pdf.add_page()
    pdf.section("7. Bank Statement Analyzer (Enterprise)")
    pdf.screenshot("bank_statement.jpg", "Figure 7.1: Bank Statement Analyzer with AI Vision OCR", 65)
    pdf.body("Enterprise users can upload bank statements for AI-powered analysis. The Bank Statement Analyzer uses Vision OCR to automatically extract:")
    pdf.bullet([
        "Transaction history and patterns",
        "Income verification and verification",
        "Balance trends over time",
        "Expense categorization",
    ])
    pdf.numbered([
        "Navigate to Features > Bank Statement Analyzer.",
        "Toggle AI Vision OCR on for enhanced accuracy.",
        "Tap 'Upload Bank Statement' and select a PDF or image.",
        "Wait for the AI to process and extract data.",
        "Review extracted information and save to client profile.",
    ])

    # Ch 8 - Audit Log
    pdf.add_page()
    pdf.section("8. Full Audit Log (Enterprise)")
    pdf.screenshot("audit_log.jpg", "Figure 8.1: Audit Log with activity tracking", 65)
    pdf.body("The Audit Log tracks every action performed in the system. It shows statistics for the last 7 days including total actions, action types, and admin activity counts.")
    pdf.bullet([
        "Login events with timestamps and IP addresses",
        "Client creation, modification, and deletion",
        "Loan creation, payment recording, and restructuring",
        "Device lock/unlock actions",
        "Settings changes and team management actions",
        "Document uploads and deletions",
    ])
    pdf.note("Audit logs are retained for 90 days. Export logs as CSV for long-term storage.")

    # Ch 9 - Revenue Forecasting
    pdf.add_page()
    pdf.section("9. Revenue Forecasting (Enterprise)")
    pdf.screenshot("revenue_forecasting.jpg", "Figure 9.1: Revenue Forecasting with time period filters", 65)
    pdf.body("AI-powered revenue predictions based on historical payment data. Select forecast periods: 30, 60, 90, 180, or 365 days.")
    pdf.subsection("Forecast Metrics")
    pdf.bullet([
        "Expected Collections: Total amount expected based on payment schedules",
        "Likely Collections: Adjusted estimate based on historical payment behavior",
        "Active Clients: Number of clients with active loans",
        "Reliability Score: Confidence level of the forecast",
    ])

    # Ch 10 - Loan Plans & Calculator
    pdf.add_page()
    pdf.section("10. Loan Plans & Calculator")
    pdf.screenshot("screenshot_092005.jpg", "Figure 10.1: Loan Plans management", 65)
    pdf.body("Pre-configure loan templates under Features > Loan Plans. Each plan defines default interest rate, duration, payment frequency, and late fee rules.")
    pdf.screenshot("screenshot_092011.jpg", "Figure 10.2: Loan Calculator", 65)
    pdf.body("The built-in Loan Calculator helps you quickly estimate EMI amounts. Enter Principal Amount, Annual Interest Rate (%), and Tenure (months), then tap 'Calculate' to see the payment schedule breakdown.")

    # Ch 11 - Bulk Import & Documents
    pdf.add_page()
    pdf.section("11. Bulk Import & Document Vault")
    pdf.screenshot("screenshot_092016.jpg", "Figure 11.1: Bulk Import clients from CSV", 65)
    pdf.body("Enterprise users can bulk import clients from CSV files. The CSV should contain columns: name, phone, email, address. The system validates data before import and reports errors.")
    pdf.screenshot("screenshot_092021.jpg", "Figure 11.2: Document Vault with search", 65)
    pdf.body("The Document Vault provides encrypted storage for client documents. Search by client name or ID, upload files up to 10MB (JPG, PNG, PDF), and categorize by type: ID, contract, proof of income, or bank statement.")

    # Ch 12 - Device Management
    pdf.add_page()
    pdf.section("12. Device Management")
    pdf.screenshot("screenshot_092029.jpg", "Figure 12.1: Device Management dashboard", 65)
    pdf.body("The Device Management screen provides an overview of all registered client devices with quick action buttons. Monitor device status, lock/unlock remotely, and track heartbeat connectivity.")
    pdf.subsection("Device Lock Modes")
    w2 = [40, 75, 75]
    pdf.table_header(["Mode", "Capabilities", "Requirement"], w2)
    pdf.table_row(["Standard", "Lock screen, kiosk mode, notification block", "Device Admin permission"], w2)
    pdf.table_row(["Device Owner", "Full control, factory reset protection", "ADB/QR provisioning"], w2, True)
    pdf.ln(2)

    # Ch 13 - Client Management
    pdf.add_page()
    pdf.section("13. Client Management")
    pdf.screenshot("clients_list.jpg", "Figure 13.1: Client list with search", 65)
    pdf.body("The Clients tab shows all your registered clients with search functionality. Each client card displays name, phone, loan status, and device status.")
    pdf.subsection("Adding a New Client")
    pdf.numbered([
        "Navigate to the Clients tab.",
        "Tap the '+' button in the top right corner.",
        "Fill in: full name (required), phone number (required).",
        "Optionally: email, address, ID number.",
        "Set device token if provisioning.",
        "Tap 'Save' to create the client.",
    ])

    # Ch 14 - Payment Reminders
    pdf.add_page()
    pdf.section("14. Payment Reminders")
    pdf.screenshot("payment_reminders.jpg", "Figure 14.1: Payment Reminders with status filters", 65)
    pdf.body("The Payment Reminders screen organizes upcoming and overdue payments with color-coded filters:")
    pdf.bullet([
        "Overdue (Red): Payments past due date - requires immediate attention",
        "Today (Yellow): Payments due today",
        "Soon (Blue): Payments due within the next 3 days",
        "Upcoming (Green): Payments due within the next 7 days",
    ])
    pdf.body("Tap any reminder to send a push notification to the client or record a payment.")

    # Ch 15 - Settings
    pdf.add_page()
    pdf.section("15. Settings & User Management")
    pdf.screenshot("settings_account.jpg", "Figure 15.1: Settings - Account, Plan, Profile, Preferences", 65)
    pdf.body("The Settings screen provides account management. Your Account section shows profile details, current subscription plan, and preferences for language, currency, and theme.")
    pdf.screenshot("settings_latefee.jpg", "Figure 15.2: Settings - Late Fee, Auto-Lock, User Management", 65)
    pdf.body("Configure Late Fee & Auto-Lock settings globally. The User Management section shows all team members with their roles and plan assignments.")
    pdf.subsection("User Management Scoping")
    w3 = [35, 55, 55, 45]
    pdf.table_header(["Role", "Can Create", "Can Manage", "Sees"], w3)
    pdf.table_row(["Super Admin", "Admins + Users", "Everyone", "All members"], w3)
    pdf.table_row(["Admin", "Users only", "Own users only", "Self + own users"], w3, True)
    pdf.table_row(["Viewer", "Nobody", "Nobody", "Self only"], w3)
    pdf.ln(2)
    pdf.warning("Admins can only manage (change plan, delete) users they created. Super Admins can manage everyone.")

    # Ch 16 - Plans
    pdf.add_page()
    pdf.section("16. Subscription Plans")
    pdf.subsection("Starter ($29/month)")
    pdf.bullet(["Up to 25 clients", "Push notifications & email reminders", "Basic analytics dashboard", "Loan calculator", "1 admin user"])
    pdf.subsection("Professional ($79/month)")
    pdf.bullet(["Up to 200 clients", "Everything in Starter +", "Device lock & unlock", "Client messaging (Telegram, WhatsApp)", "PDF contract generation", "Auto-lock & late fee automation", "Team management (3 members)", "GPS tracking, Advanced reports, Loan plans"])
    pdf.subsection("Enterprise ($199/month)")
    pdf.bullet(["Unlimited clients & team", "Everything in Professional +", "QR & NFC provisioning, Device Owner mode", "Bank statement OCR (AI), Document vault", "Stripe payments, Scheduled reports", "Full audit log, Risk scoring", "Revenue forecasting, Bulk import/export", "REST API access, Priority support"])

    # Ch 17 - Security
    pdf.add_page()
    pdf.section("17. Security & Tamper Detection")
    pdf.body("PayLock Pro includes multiple security layers to prevent client device tampering.")
    pdf.subsection("Permission Monitoring")
    pdf.body("The client app monitors 8 critical permissions. If any permission is revoked via device settings:")
    pdf.numbered([
        "First detection: Full-screen Security Alert + push notification warning.",
        "Second detection (permission still revoked): Tamper reported to server + device data wipe initiated.",
    ])
    pdf.warning("Data wipe is irreversible. Ensure clients understand consequences of tampering.")
    pdf.subsection("Admin Mode Protection")
    pdf.body("If Device Admin is deactivated: immediate Security Alert, push notification, and if not re-enabled: tamper report + factory reset.")

    # Ch 18 - Troubleshooting
    pdf.add_page()
    pdf.section("18. Troubleshooting & FAQ")
    pdf.subsection("Cannot Login")
    pdf.bullet(["Verify username/password (case-sensitive).", "Check internet connection.", "Contact Super Admin to reset password."])
    pdf.subsection("Device Not Responding")
    pdf.bullet(["Verify client app is installed.", "Check device internet connectivity.", "Ensure all 8 permissions are granted.", "Check device admin is active."])
    pdf.subsection("Contact Support")
    pdf.body("Email: support@paylock.pro\nWebsite: paylock.pro/contact\nStarter: 48h | Professional: 24h | Enterprise: 4h SLA")

    pdf.output(os.path.join(OUT_DIR, "PayLockPro_Admin_Manual.pdf"))
    print("Admin manual generated with 19 real screenshots.")


# ============================================================
# CLIENT APP MANUAL - detailed text instructions only
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
        "Emergency Features",
        "Language & Accessibility",
        "FAQ & Troubleshooting",
    ])

    # Ch 1
    pdf.add_page()
    pdf.section("1. Introduction")
    pdf.body("The PayLock Pro Client app is installed on your device as part of a loan agreement. This manual explains how the app works, what permissions it needs, and what happens during the loan period.")
    pdf.subsection("What the App Does")
    pdf.bullet([
        "Displays your loan status and payment schedule",
        "Sends payment reminders before due dates",
        "Allows your lender to manage device access based on payment status",
        "Tracks device location for compliance purposes",
        "Enables secure communication with your lender",
    ])
    pdf.subsection("What the App Does NOT Do")
    pdf.bullet([
        "Does NOT access your personal files, photos, or messages",
        "Does NOT record audio or video",
        "Does NOT share data with third parties",
        "Does NOT charge you any fees",
    ])
    pdf.note("The app requires certain permissions to function. These are part of your loan agreement and cannot be changed while the loan is active.")

    # Ch 2
    pdf.add_page()
    pdf.section("2. Installation & Setup")
    pdf.subsection("Installation Methods")
    pdf.bullet([
        "Direct APK: Your lender sends you a download link. Tap to install.",
        "QR Code Scan: Your lender shows a QR code. Scan with camera to begin setup.",
        "NFC Tap: Touch your device to lender's device for instant enrollment.",
    ])
    pdf.subsection("System Requirements")
    pdf.bullet([
        "Android 8.0 (Oreo) or later",
        "Active internet connection (WiFi or mobile data)",
        "At least 100MB free storage",
    ])
    pdf.subsection("Step-by-Step Installation")
    pdf.numbered([
        "Receive the APK file or link from your lender.",
        "If prompted, enable 'Install from unknown sources' in Android settings.",
        "Tap the APK file to begin installation.",
        "Tap 'Install' when prompted by the system.",
        "Wait for installation to complete (usually 30-60 seconds).",
        "Tap 'Open' to launch the app.",
    ])
    pdf.warning("Do not uninstall or disable the app without your lender's permission. Tampering may result in data loss.")

    # Ch 3
    pdf.add_page()
    pdf.section("3. Registration Process")
    pdf.body("After installation, you need to register your device with your lender's system.")
    pdf.numbered([
        "Open the PayLock Pro Client app.",
        "The registration screen appears with a code entry field.",
        "Enter the activation code provided by your lender (usually 6-8 characters).",
        "Your name and loan details appear for confirmation.",
        "Review the information carefully - ensure your name is correct.",
        "Tap 'Register' to complete device activation.",
        "The app transitions to the permission setup screen.",
    ])
    pdf.note("Keep your activation code safe. You may need it if you reset your device or switch to a new phone.")
    pdf.tip("If registration fails, check your internet connection and verify the activation code with your lender.")

    # Ch 4
    pdf.add_page()
    pdf.section("4. Granting Permissions")
    pdf.body("The app requires 8 permissions for proper operation. After registration, you'll see a permission setup screen with 8 cards arranged in a 2-column grid. Each card shows a green checkmark (granted) or red X (not granted).")
    pdf.subsection("The 8 Required Permissions")
    pdf.ln(1)
    w4 = [30, 55, 55, 50]
    pdf.table_header(["#", "Permission", "Why Needed", "How to Grant"], w4)
    pdf.table_row(["1", "Battery", "Keeps app running", "Tap > Allow unrestricted"], w4)
    pdf.table_row(["2", "Overlay", "Shows lock screen", "Tap > Toggle ON"], w4, True)
    pdf.table_row(["3", "Auto Start", "Restarts after reboot", "Tap > Follow instructions"], w4)
    pdf.table_row(["4", "Accessibility", "Device management", "Tap > Enable service"], w4, True)
    pdf.table_row(["5", "Location", "Compliance tracking", "Tap > Allow Always"], w4)
    pdf.table_row(["6", "Notification", "Payment reminders", "Tap > Allow"], w4, True)
    pdf.table_row(["7", "Usage Stats", "Security monitoring", "Tap > Toggle ON"], w4)
    pdf.table_row(["8", "Notif. Listener", "Ensures alerts work", "Tap > Enable"], w4, True)
    pdf.ln(2)
    pdf.subsection("Device Admin Activation")
    pdf.body("After all 8 permissions are granted, the app asks to activate Device Admin mode:")
    pdf.numbered([
        "A dialog appears: 'Enable Device Admin?'",
        "Read the explanation of what Device Admin allows.",
        "Tap 'Yes, Enable' to activate.",
        "Green checkmark confirms activation.",
        "Setup is complete - the app runs in the background.",
    ])
    pdf.warning("Once permissions are locked by your lender, disabling them from device settings will trigger a security alert. If permissions remain disabled, your device data will be wiped.")

    # Ch 5
    pdf.add_page()
    pdf.section("5. Understanding the Home Screen")
    pdf.body("After setup, the home screen shows your current status with several information sections.")
    pdf.subsection("Status Elements")
    pdf.bullet([
        "Welcome Message: Your name and account status at the top",
        "Protection Status: Green shield = fully protected | Yellow = permissions missing",
        "Device Status: Shows if device is locked or unlocked",
        "Permission Cards: 8 cards showing each permission status (green/red)",
        "Device Admin Toggle: Shows admin mode status (active/inactive)",
        "Warning Banner: Important notices from lender (auto-dismiss after 10 seconds)",
    ])
    pdf.subsection("Refreshing Your Status")
    pdf.body("The app auto-refreshes every 5 seconds. You can also swipe down to manually refresh and get the latest status from the server.")
    pdf.subsection("Language Selection")
    pdf.body("Change the app language using the picker in the top right corner. Available: English, Estonian (Eesti), Russian.")

    # Ch 6
    pdf.add_page()
    pdf.section("6. Payment Information")
    pdf.body("Your loan details are displayed on the home screen when available:")
    pdf.bullet([
        "Loan Amount: Total principal borrowed",
        "Outstanding Balance: Remaining amount to pay",
        "Monthly EMI: Your regular payment amount",
        "Next Due Date: When your next payment is expected",
        "Interest Rate: Annual percentage rate on your loan",
        "Payment History: List of all recorded payments",
    ])
    pdf.body("Make payments directly to your lender using their specified method (cash, bank transfer, mobile money). Once your lender records the payment, your status updates automatically within minutes.")
    pdf.tip("Pay on time to avoid device locking and late fees. Set a personal reminder 2-3 days before your due date.")
    pdf.subsection("Understanding Late Fees")
    pdf.body("If payment is not received by the due date:")
    pdf.numbered([
        "Grace period begins (typically 3 days) - no fees yet.",
        "After grace period: late fee is applied (% of monthly payment).",
        "If still unpaid: device may be automatically locked.",
        "Late fees compound with each missed payment.",
    ])

    # Ch 7
    pdf.add_page()
    pdf.section("7. Device Lock & What to Expect")
    pdf.body("If a payment is overdue past the grace period, your lender may lock your device.")
    pdf.subsection("When Your Device is Locked")
    pdf.bullet([
        "A full-screen lock message appears with a dark red/black background",
        "Large lock icon and 'Device Locked' text displayed prominently",
        "Custom message from your lender explains the reason",
        "Pending payment amount and due date are shown",
        "Status bar and navigation are completely blocked",
        "You CANNOT use other apps, make calls (except emergency), or access settings",
        "Emergency call button (112/911) is available at the bottom of the screen",
    ])
    pdf.subsection("How to Get Unlocked")
    pdf.numbered([
        "Contact your lender to arrange payment (use another phone if needed).",
        "Make the required payment through agreed method.",
        "Your lender confirms payment in their system.",
        "Device unlocks automatically within minutes.",
        "You regain full access to all apps and functions.",
    ])
    pdf.subsection("What WON'T Work to Bypass the Lock")
    pdf.bullet([
        "Restarting the device - lock persists across reboots",
        "Clearing app data - protection is backed up externally",
        "Turning off internet - lock works offline",
        "Force stopping the app - it auto-restarts",
        "Pulling down notification shade - blocked when locked",
    ])
    pdf.warning("Do NOT attempt to factory reset your device. If Device Owner mode is active, factory reset is blocked. If somehow successful, your device data will be permanently lost.")

    # Ch 8
    pdf.add_page()
    pdf.section("8. In-App Messaging")
    pdf.body("If your lender has enabled messaging, you can communicate directly through the app.")
    pdf.numbered([
        "Tap the chat/message icon on the home screen.",
        "Type your message in the text field at the bottom.",
        "Tap 'Send' to deliver.",
        "Your lender sees the message and can respond.",
        "Messages sync across sessions and are stored on the server.",
    ])
    pdf.body("Your lender may also contact you via Telegram or WhatsApp if those integrations are configured.")
    pdf.tip("Use messaging to request payment extensions, report issues, or ask questions about your loan.")

    # Ch 9
    pdf.add_page()
    pdf.section("9. Security & Protection")
    pdf.body("The app includes security features to maintain the loan agreement.")
    pdf.subsection("What Happens If You Disable Permissions")
    pdf.body("If you go to your phone's Settings and disable any of the 8 required permissions:")
    pdf.numbered([
        "The app detects the change when you return to the app.",
        "A full-screen Security Alert dialog appears immediately.",
        "A push notification is sent as a warning.",
        "You must re-enable the permission in device Settings immediately.",
        "If the permission remains disabled on the next app check: the app reports tampering to the server and initiates a DATA WIPE of the device.",
    ])
    pdf.subsection("What Triggers Security Responses")
    pdf.bullet([
        "Disabling ANY of the 8 required permissions from device settings",
        "Deactivating Device Admin mode",
        "Attempting to uninstall the app (when uninstall is blocked)",
        "Clearing app data or cache",
        "Factory resetting (Device Owner mode prevents this)",
    ])
    pdf.warning("TAMPERING WITH THE APP OR ITS PERMISSIONS WILL RESULT IN A DATA WIPE. This means ALL data on your device will be permanently erased. Always contact your lender before making any changes to app permissions.")

    # Ch 10
    pdf.add_page()
    pdf.section("10. Emergency Features")
    pdf.subsection("Emergency Calls")
    pdf.body("Even when your device is locked, you can always make emergency calls:")
    pdf.bullet([
        "Tap the 'Emergency Call' button at the bottom of the lock screen.",
        "This dials your local emergency number (112 in Europe, 911 in US).",
        "Emergency calls are NEVER blocked by the app.",
    ])
    pdf.subsection("SOS Contact")
    pdf.body("If you're in a situation where you need help, the emergency call feature is always accessible regardless of lock or payment status.")

    # Ch 11
    pdf.section("11. Language & Accessibility")
    pdf.body("The app supports multiple languages to ensure accessibility:")
    pdf.bullet([
        "English: Full interface in English",
        "Eesti (Estonian): Complete Estonian translation",
        "Russian: Full Russian translation",
    ])
    pdf.body("To change language: tap the language picker icon (flag/globe) in the top right corner of the home screen. The entire interface updates immediately.")

    # Ch 12
    pdf.add_page()
    pdf.section("12. FAQ & Troubleshooting")
    pdf.subsection("Can I uninstall the app?")
    pdf.body("Only with your lender's permission after your loan is fully repaid.")
    pdf.subsection("My device is locked but I made a payment")
    pdf.body("Contact your lender to confirm receipt. Unlock happens automatically within minutes after confirmation.")
    pdf.subsection("The app is draining my battery")
    pdf.body("The app uses less than 2% battery per day. Ensure battery optimization exemption is granted (Permission #1). Do not force-stop the app.")
    pdf.subsection("I'm not receiving notifications")
    pdf.body("Check notification permissions in both app and device settings. Some manufacturers (Huawei, Xiaomi, Oppo) have aggressive battery management - follow Auto Start instructions.")
    pdf.subsection("I changed phones")
    pdf.body("Contact your lender to: 1) Remove old device, 2) Get new activation code, 3) Set up app on new phone.")
    pdf.subsection("The app crashed")
    pdf.body("It restarts automatically. If persistent: restart device, check for updates from lender, or request replacement APK.")
    pdf.subsection("Contact")
    pdf.body("Technical: support@paylock.pro\nPayment issues: Contact your lender directly\nInclude: your name, lender name, device model, problem description.")

    pdf.output(os.path.join(OUT_DIR, "PayLockPro_Client_Manual.pdf"))
    print("Client manual generated (detailed text instructions).")


# ============================================================
# WEB PORTAL MANUAL - with real portal screenshots
# ============================================================
def gen_portal():
    pdf = Manual()
    pdf.title_text = "Web Portal User Manual"
    pdf.alias_nb_pages()
    pdf.cover("Web Portal", "Complete User Manual with Screenshots")

    pdf.add_page()
    pdf.section("Table of Contents")
    pdf.numbered([
        "Accessing the Portal & Login",
        "Dashboard Overview",
        "Client Management",
        "Reports & Analytics",
        "Device Management",
        "Document Vault",
        "Team Management",
        "Exports & Data",
        "Device Configuration (QR/NFC)",
        "Additional Portal Features",
        "Keyboard Shortcuts & Tips",
    ])

    # Ch 1
    pdf.add_page()
    pdf.section("1. Accessing the Portal & Login")
    pdf.screenshot("portal_login.png", "Figure 1.1: Portal Login screen", 140)
    pdf.body("Open your browser and navigate to your PayLock Pro portal URL (e.g., https://your-server.com/api/portal). Enter your admin username and password, then click 'Logi sisse' (Login).")
    pdf.subsection("Supported Browsers")
    pdf.bullet(["Chrome 90+ (recommended)", "Firefox 90+", "Safari 15+", "Edge 90+"])
    pdf.note("The portal uses the same credentials as the mobile admin app. All data syncs in real-time between both platforms.")

    # Ch 2
    pdf.add_page()
    pdf.section("2. Dashboard Overview")
    pdf.screenshot("portal_dashboard_real.png", "Figure 2.1: Portal Dashboard - Real-time portfolio metrics", 160)
    pdf.body("The dashboard shows real-time metrics for your portfolio:")
    pdf.bullet([
        "KLIENDID KOKKU (Total Clients): Number of registered clients",
        "KOKKU KOGUTUD (Total Collected): Total payments received",
        "TASUMATA (Unpaid): Outstanding balance across all loans",
        "TAHTAJA ULETANUD (Overdue): Number of overdue clients",
        "VALJASTATUD (Disbursed): Total loan amount given out",
        "LUKUSTATUD SEADMED (Locked Devices): Currently locked device count",
        "SEE KUU (This Month): Monthly collection amount",
        "VIIVISTTARASU (Late Fees): Total late fees accrued",
    ])
    pdf.body("Below the metrics, Revenue Trends and Profit Trends charts show 6-month financial history.")

    # Ch 3
    pdf.add_page()
    pdf.section("3. Client Management")
    pdf.screenshot("portal_clients_real.png", "Figure 3.1: Client list with status indicators", 160)
    pdf.body("The Clients page displays all clients in a table with columns: Name, Phone, Loan Amount, Outstanding Balance, Status (Active/Overdue/Paid), and Device Status (Active/Locked).")
    pdf.subsection("Adding a Client")
    pdf.numbered([
        "Click '+ Lisa klient' (Add Client) button at the top.",
        "Fill in: Name (required), Phone (required), Email, Address.",
        "Click 'Create' to save.",
    ])
    pdf.subsection("Client Actions")
    pdf.body("Click the eye icon on any client to view their full profile:")
    pdf.bullet([
        "Contact details and identification",
        "Active loans with payment schedules",
        "Payment history with dates and methods",
        "Device status with lock/unlock controls",
        "GPS location on interactive map",
        "Document vault",
        "Communication log",
    ])

    # Ch 4
    pdf.add_page()
    pdf.section("4. Reports & Analytics")
    pdf.screenshot("portal_reports_real.png", "Figure 4.1: Reports with financial metrics and export options", 160)
    pdf.body("Navigate to Aruanded (Reports) in the sidebar. The reports page shows comprehensive financial data with tabs for Financial, Client, and Revenue analysis.")
    pdf.subsection("Metrics Displayed")
    pdf.bullet([
        "KOKKU VALJASTATUD: Total disbursed across all loans",
        "KOKKU KOGUTUD: Total collected from all payments",
        "TASUMATA: Total outstanding balance",
        "KOGUMISMAAR: Collection rate percentage",
        "TEENITUD INTRESS: Total interest earned",
        "VIIVISTTARASU: Total late fees",
        "LEPINGUTASUD: Contract fees",
        "KOGUTULU: Total revenue (collections + fees + interest)",
    ])
    pdf.subsection("Export Options")
    pdf.body("Click 'Ekspordi PDF' for formatted reports or 'Ekspordi CSV' for raw data export.")

    # Ch 5
    pdf.add_page()
    pdf.section("5. Device Management")
    pdf.screenshot("portal_devices_real.png", "Figure 5.1: Device monitoring with connectivity status", 160)
    pdf.body("The Seadmed (Devices) page shows all registered devices organized by connectivity status:")
    pdf.bullet([
        "SEES (Online): Devices seen in last 30 minutes",
        "HOIATUS (Warning): Devices last seen 30-120 minutes ago",
        "KRIITILINE (Critical): Devices not seen for over 120 minutes",
    ])
    pdf.body("The table shows: Client name, Device model (e.g., Samsung Galaxy A50), Last seen timestamp, and Lock status (Avatud=Open, Lukustatud=Locked).")
    pdf.subsection("Quick Actions")
    pdf.body("Click any device row to access: Lock/Unlock controls, GPS location, Heartbeat history, Permission status.")

    # Ch 6
    pdf.add_page()
    pdf.section("6. Document Vault")
    pdf.screenshot("portal_documents_real.png", "Figure 6.1: Document vault with upload and search", 160)
    pdf.body("The Dokumendihoidla (Document Vault) provides encrypted storage for client files.")
    pdf.subsection("Uploading Documents")
    pdf.numbered([
        "Click 'Lae dokument ules' (Upload Document) button.",
        "Select a file from your computer (max 10MB).",
        "Choose the client and document type.",
        "Click 'Upload' to store securely.",
    ])
    pdf.body("Search documents by client ID or name. Supported types: JPG, PNG, PDF. The vault shows total document count, total size, and contract count.")

    # Ch 7
    pdf.add_page()
    pdf.section("7. Team Management")
    pdf.screenshot("portal_team_real.png", "Figure 7.1: Team management with role assignments", 160)
    pdf.body("The Meeskond (Team) page shows all team members with their username, name, role, email, status, and last activity.")
    pdf.subsection("Adding Team Members")
    pdf.numbered([
        "Click 'Lisa liige' (Add Member) button.",
        "Fill in: Username, First Name, Last Name, Password.",
        "Select role: Super Admin, Admin, Collections, or Viewer.",
        "Click 'Add' to create the account.",
    ])
    pdf.subsection("Role Permissions")
    w5 = [40, 75, 75]
    pdf.table_header(["Role", "Capabilities", "Management"], w5)
    pdf.table_row(["Super Admin", "Full access to all features", "Can manage all users"], w5)
    pdf.table_row(["Admin", "All features per plan", "Only own created users"], w5, True)
    pdf.table_row(["Collections", "View clients, record payments", "No team management"], w5)
    pdf.table_row(["Viewer", "Read-only access", "No management"], w5, True)
    pdf.ln(2)

    # Ch 8
    pdf.add_page()
    pdf.section("8. Exports & Data")
    pdf.screenshot("portal_exports_real.png", "Figure 8.1: Export options for Clients, Payments, and Collections", 160)
    pdf.body("The Exports page provides one-click data export in multiple formats:")
    pdf.subsection("Available Reports")
    pdf.bullet([
        "Clients Report: Client data with loan status, payment history, risk scores (CSV, PDF, Excel)",
        "Payments Report: Detailed payment history with dates, amounts, and status (CSV, PDF)",
        "Collection Report: Collection rates, overdue trends, and financial summary (CSV, PDF)",
    ])
    pdf.tip("Export reports regularly for offline backup and external analysis in Excel or Google Sheets.")

    # Ch 9
    pdf.add_page()
    pdf.section("9. Device Configuration (QR/NFC)")
    pdf.screenshot("portal_settings_real.png", "Figure 9.1: QR code and NFC configuration", 160)
    pdf.body("The Seadistamine (Configuration) page allows generating QR codes and NFC tags for device provisioning.")
    pdf.subsection("QR Code Setup")
    pdf.numbered([
        "Enter your WiFi SSID (network name).",
        "Enter WiFi password.",
        "Verify the Server URL points to your PayLock API.",
        "Click 'Genereeri QR-kood' (Generate QR Code).",
        "Show the QR code to the client device for automatic setup.",
    ])
    pdf.subsection("NFC Tag")
    pdf.body("Switch to the 'NFC silt' tab to configure NFC enrollment tags for tap-to-enroll device provisioning (Enterprise feature).")

    # Ch 10
    pdf.add_page()
    pdf.section("10. Additional Portal Features")
    pdf.subsection("Sidebar Navigation")
    pdf.body("The full sidebar menu provides access to all portal features:")
    pdf.bullet([
        "Juhtpaneel - Dashboard overview",
        "Kliendid - Client management",
        "Laenuplaanid - Loan plan templates",
        "Meeldetuletused - Payment reminders",
        "Aruanded - Reports & analytics",
        "Seadmed - Device management",
        "Dokumendid - Document vault",
        "Bank Analyzer - AI bank statement analysis",
        "Risk Scoring - Client risk assessment",
        "Bulk Messaging - Mass notification sending",
        "Exports - Data export (CSV, PDF, Excel)",
        "CSV Import - Bulk client import",
        "Ajakavad - Payment schedules",
        "Telegram - Messaging integration",
        "Meeskond - Team management",
        "Tegevuslogi - Activity/audit log",
        "Seadistamine - Device QR/NFC configuration",
        "Seaded - Account settings",
    ])
    pdf.subsection("Responsive Design")
    pdf.body("The portal is fully responsive and works on mobile browsers. Add it to your home screen for app-like access.")

    # Ch 11
    pdf.section("11. Keyboard Shortcuts & Tips")
    pdf.bullet([
        "Use browser bookmarks for quick client profile access",
        "Right-click client names to open in new tabs",
        "Ctrl+F to search within any page",
        "Export reports regularly for offline backup",
        "Set up scheduled reports to stay informed without logging in (Enterprise)",
    ])

    pdf.output(os.path.join(OUT_DIR, "PayLockPro_WebPortal_Manual.pdf"))
    print("Web Portal manual generated with real screenshots.")


if __name__ == "__main__":
    gen_admin()
    gen_client()
    gen_portal()
    print(f"\nAll manuals saved to {OUT_DIR}/")
