"""Generate PayLock Pro user manuals as PDFs."""
import os
from fpdf import FPDF

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "manuals")
os.makedirs(OUT_DIR, exist_ok=True)

BLUE = (14, 165, 233)
DARK = (15, 23, 42)
GRAY = (100, 116, 139)
WHITE = (255, 255, 255)


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
        self.cell(0, 6, "Version 1.2.1  |  March 2026", align="C", new_x="LMARGIN", new_y="NEXT")
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
            self.multi_cell(0, 5.5, item)
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


# ============================================================
# 1. ADMIN APP MANUAL
# ============================================================
def gen_admin():
    pdf = Manual()
    pdf.title_text = "Admin App User Manual"
    pdf.alias_nb_pages()
    pdf.cover("Admin App", "User Manual")

    # TOC
    pdf.add_page()
    pdf.section("Table of Contents")
    pdf.numbered([
        "Getting Started & Login",
        "Dashboard Overview",
        "Client Management",
        "Loan Management",
        "Payment Tracking",
        "Device Lock & Unlock",
        "Reports & Analytics",
        "Document Vault",
        "Settings & User Management",
        "Team Management & Permissions",
        "Subscription Plans",
        "Troubleshooting",
    ])

    # Ch 1
    pdf.add_page()
    pdf.section("1. Getting Started & Login")
    pdf.body("Download the PayLock Pro Admin app from Expo or install the APK provided by your administrator.")
    pdf.subsection("Login")
    pdf.numbered([
        "Open the app and enter your username and password.",
        "Tap 'Login' to access your dashboard.",
        "If you are the first user, your account is automatically a Super Admin.",
    ])
    pdf.note("Passwords must be at least 6 characters. Contact your Super Admin if you forget your credentials.")

    # Ch 2
    pdf.section("2. Dashboard Overview")
    pdf.body("The dashboard displays real-time metrics for your loan portfolio:")
    pdf.bullet([
        "Total clients and active loans",
        "Monthly collections and overdue amounts",
        "Interest earned this month",
        "Collection rate percentage",
        "Quick action buttons for common tasks",
    ])
    pdf.body("Tap any metric card to drill down into detailed views. The dashboard auto-refreshes every 30 seconds.")

    # Ch 3
    pdf.add_page()
    pdf.section("3. Client Management")
    pdf.subsection("Adding a Client")
    pdf.numbered([
        "Navigate to the Clients tab.",
        "Tap the '+' button in the top right.",
        "Fill in client details: name, phone, email, address.",
        "Optionally assign a device using the device token.",
        "Tap 'Save' to create the client.",
    ])
    pdf.subsection("Client Details")
    pdf.body("Tap any client to view their full profile including:")
    pdf.bullet([
        "Contact information and device status",
        "Active loans and payment history",
        "GPS location history (Professional+ plan)",
        "Document vault access",
        "Device lock/unlock controls",
        "Credit score (Enterprise plan)",
    ])
    pdf.subsection("Bulk Import")
    pdf.body("Enterprise users can import clients from CSV files. Go to Features > Bulk Import and upload a CSV with columns: name, phone, email, address.")

    # Ch 4
    pdf.section("4. Loan Management")
    pdf.subsection("Creating a Loan")
    pdf.numbered([
        "Open a client's profile.",
        "Tap 'New Loan'.",
        "Select a loan plan or enter custom terms.",
        "Set principal amount, interest rate, duration, and payment frequency.",
        "Choose the interest calculation method (flat or day-count).",
        "Tap 'Create Loan'.",
    ])
    pdf.subsection("Loan Plans")
    pdf.body("Pre-configure loan templates under Features > Loan Plans. Each plan defines default interest rates, durations, and payment schedules.")
    pdf.subsection("Loan Restructuring")
    pdf.body("For overdue loans, use the restructure option in client details to modify terms, extend duration, or adjust the outstanding balance.")

    # Ch 5
    pdf.add_page()
    pdf.section("5. Payment Tracking")
    pdf.body("Record payments from the Payments tab or from within a client's loan details.")
    pdf.subsection("Recording a Payment")
    pdf.numbered([
        "Navigate to the loan or use the Payments tab.",
        "Tap 'Record Payment'.",
        "Enter the amount and payment method.",
        "Add optional notes.",
        "Tap 'Confirm'.",
    ])
    pdf.subsection("Payment Reminders")
    pdf.body("Automated reminders are sent via push notification and email before payment due dates. Configure reminder schedules in Features > Payment Reminders.")
    pdf.subsection("Late Fees")
    pdf.body("Late fees are automatically calculated based on your configured rules. The system applies fees after the grace period expires.")

    # Ch 6
    pdf.section("6. Device Lock & Unlock")
    pdf.body("Lock client devices remotely when payments are overdue.")
    pdf.subsection("Manual Lock")
    pdf.numbered([
        "Open the client's profile.",
        "Tap 'Lock Device'.",
        "Enter a lock reason and custom message.",
        "The client's device will display your message on the lock screen.",
    ])
    pdf.subsection("Auto-Lock")
    pdf.body("Configure auto-lock rules under Features > Device Management. Devices lock automatically when payments are overdue past the grace period.")
    pdf.note("Device Owner mode provides full control including app whitelisting and factory reset protection (Enterprise plan).")

    # Ch 7
    pdf.add_page()
    pdf.section("7. Reports & Analytics")
    pdf.body("Access comprehensive reports from Features > Reports.")
    pdf.bullet([
        "Financial summary with profit/loss analysis",
        "Collection trends over time",
        "Client health scores and risk distribution",
        "Monthly interest earned breakdown",
        "Export reports as PDF or CSV",
        "Revenue forecasting (Enterprise)",
        "Portfolio health and NPA tracking (Enterprise)",
    ])

    # Ch 8
    pdf.section("8. Document Vault")
    pdf.body("Securely store client documents in the encrypted vault.")
    pdf.subsection("Uploading Documents")
    pdf.numbered([
        "Open a client's profile.",
        "Navigate to the Documents tab.",
        "Tap 'Upload' and select a file (max 10MB).",
        "Choose the document type: ID photo, contract, proof of income, or other.",
        "Add a description and tap 'Upload'.",
    ])
    pdf.body("Documents are stored on the server with encryption at rest. Download or delete documents at any time.")

    # Ch 9
    pdf.add_page()
    pdf.section("9. Settings & User Management")
    pdf.subsection("User Management")
    pdf.body("Manage your team from Settings > User Management.")
    pdf.bullet([
        "Super Admins: Can create admins and users, manage all plans",
        "Admins: Can create users only, manage user plans",
        "Users (Viewer/Collections): Cannot create or manage anyone",
    ])
    pdf.subsection("Changing a User's Plan")
    pdf.numbered([
        "Go to Settings > User Management.",
        "Find the user in the list.",
        "Tap the plan icon (tag icon) next to their name.",
        "Select the new plan: Starter, Professional, or Enterprise.",
    ])
    pdf.subsection("Active Sessions")
    pdf.body("View and revoke active login sessions from Settings > Active Sessions. Each session shows the login time, IP address, and device info.")

    # Ch 10
    pdf.section("10. Subscription Plans")
    pdf.body("PayLock Pro offers three subscription tiers:")
    pdf.subsection("Starter ($29/month)")
    pdf.bullet(["Up to 25 clients", "Push notifications", "Basic analytics dashboard", "Email reminders", "Loan calculator"])
    pdf.subsection("Professional ($79/month)")
    pdf.bullet(["Up to 200 clients", "Everything in Starter", "Device lock & unlock", "Client messaging", "PDF contracts", "Auto payments & late fees", "Team management (3 members)", "GPS tracking", "Advanced reports (PDF & CSV)"])
    pdf.subsection("Enterprise ($199/month)")
    pdf.bullet(["Unlimited clients & team", "Everything in Professional", "QR & NFC provisioning", "Device Owner mode", "Bank statement OCR", "Document vault", "Stripe payments", "Scheduled reports", "Session management", "Role-based permissions", "Credit scoring", "Bulk import/export", "Full REST API access", "Priority support & SLA"])

    # Ch 11
    pdf.add_page()
    pdf.section("11. Troubleshooting")
    pdf.subsection("Cannot Login")
    pdf.bullet(["Check username and password are correct.", "Ensure you have an active internet connection.", "Contact your Super Admin to reset your password."])
    pdf.subsection("Device Not Responding to Lock/Unlock")
    pdf.bullet(["Verify the client device has the PayLock Client app installed.", "Check that the device has an active internet connection.", "Ensure all required permissions are granted on the client device.", "Try sending a push notification to verify connectivity."])
    pdf.subsection("Contact Support")
    pdf.body("Email: support@paylock.pro\nWebsite: https://paylock.pro/contact\nResponse time: Within 24 hours (Enterprise: 4 hours SLA)")

    pdf.output(os.path.join(OUT_DIR, "PayLockPro_Admin_Manual.pdf"))
    print("Admin manual generated.")


# ============================================================
# 2. CLIENT APP MANUAL
# ============================================================
def gen_client():
    pdf = Manual()
    pdf.title_text = "Client App User Manual"
    pdf.alias_nb_pages()
    pdf.cover("Client App", "User Manual")

    pdf.add_page()
    pdf.section("Table of Contents")
    pdf.numbered([
        "Introduction",
        "Installation & Setup",
        "Granting Permissions",
        "Understanding the Home Screen",
        "Payment Information",
        "Device Lock & Notifications",
        "Contacting Your Lender",
        "FAQ & Troubleshooting",
    ])

    # Ch 1
    pdf.add_page()
    pdf.section("1. Introduction")
    pdf.body("The PayLock Pro Client app is installed on your device as part of a loan agreement with your lender. The app enables your lender to:")
    pdf.bullet([
        "Send you payment reminders and notifications",
        "Display payment information and loan status",
        "Manage device access based on your payment status",
        "Track device location for compliance purposes",
    ])
    pdf.note("The app requires certain permissions to function. These permissions are part of your loan agreement.")

    # Ch 2
    pdf.section("2. Installation & Setup")
    pdf.body("Your lender will provide you with the app in one of these ways:")
    pdf.bullet([
        "Direct APK download link",
        "QR code scan (zero-touch setup)",
        "NFC tap enrollment",
    ])
    pdf.numbered([
        "Install the app on your Android device.",
        "Open the app and enter the activation code provided by your lender.",
        "Follow the on-screen instructions to grant required permissions.",
        "Once setup is complete, the app will run in the background.",
    ])

    # Ch 3
    pdf.section("3. Granting Permissions")
    pdf.body("The app requires the following permissions for proper operation:")
    pdf.subsection("Required Permissions")
    pdf.bullet([
        "Battery Optimization: Ensures the app stays active in the background.",
        "Display Over Other Apps (Overlay): Shows payment reminders and lock screens.",
        "Auto-Start: Allows the app to restart after device reboot.",
        "Accessibility Service: Enables device administration features.",
        "Location: Tracks device location for compliance monitoring.",
        "Notifications: Receives payment reminders and alerts.",
        "Usage Stats: Monitors app usage for security.",
        "Notification Listener: Ensures critical alerts are not dismissed.",
    ])
    pdf.note("Once all permissions are granted and your lender has disabled uninstall, these permissions cannot be changed. Attempting to revoke permissions may trigger a security response including data wipe.")

    # Ch 4
    pdf.add_page()
    pdf.section("4. Understanding the Home Screen")
    pdf.body("The home screen shows your current status:")
    pdf.bullet([
        "Protection Status: Green = all permissions active, Yellow = some missing",
        "Device Status: Shows if your device is locked or unlocked",
        "Payment Status: Next payment due date and amount",
        "Lender Contact: Quick access to contact your lender",
    ])

    # Ch 5
    pdf.section("5. Payment Information")
    pdf.body("You will receive notifications before each payment due date. The app displays:")
    pdf.bullet([
        "Total loan amount and remaining balance",
        "Next payment date and amount due",
        "Payment history and receipts",
        "Late fees (if applicable)",
    ])
    pdf.body("Make payments directly to your lender using the methods they specify. Once your lender records the payment, your status updates automatically.")

    # Ch 6
    pdf.section("6. Device Lock & Notifications")
    pdf.body("If a payment is overdue past the grace period, your lender may lock your device. When locked:")
    pdf.bullet([
        "A lock screen message from your lender will be displayed.",
        "You can still make emergency calls (112/911).",
        "The device unlocks automatically when your lender confirms payment.",
        "Temporary unlocks may be granted by your lender.",
    ])

    # Ch 7
    pdf.section("7. Contacting Your Lender")
    pdf.body("Use the in-app messaging feature or contact your lender directly:")
    pdf.bullet([
        "In-app chat (if available on your plan)",
        "Phone number displayed on the lock screen",
        "Email provided in your loan agreement",
    ])

    # Ch 8
    pdf.add_page()
    pdf.section("8. FAQ & Troubleshooting")
    pdf.subsection("Can I uninstall the app?")
    pdf.body("The app can only be uninstalled with your lender's permission. Contact your lender to discuss uninstallation after your loan is fully repaid.")
    pdf.subsection("My device is locked but I made a payment")
    pdf.body("Contact your lender to confirm payment receipt. Once confirmed, your device will be unlocked within minutes.")
    pdf.subsection("The app is draining my battery")
    pdf.body("The app is optimized for minimal battery usage. If you experience issues, ensure battery optimization is enabled in your device settings.")
    pdf.subsection("I'm not receiving notifications")
    pdf.body("Check that notification permissions are granted and that the app is not being killed by your device's battery saver. Contact your lender if issues persist.")
    pdf.subsection("Contact Support")
    pdf.body("For technical issues: support@paylock.pro\nFor payment issues: Contact your lender directly")

    pdf.output(os.path.join(OUT_DIR, "PayLockPro_Client_Manual.pdf"))
    print("Client manual generated.")


# ============================================================
# 3. WEB PORTAL MANUAL
# ============================================================
def gen_portal():
    pdf = Manual()
    pdf.title_text = "Web Portal User Manual"
    pdf.alias_nb_pages()
    pdf.cover("Web Portal", "User Manual")

    pdf.add_page()
    pdf.section("Table of Contents")
    pdf.numbered([
        "Accessing the Portal",
        "Dashboard",
        "Client Management",
        "Loan Management",
        "Payment Processing",
        "Device Management",
        "Reports & Exports",
        "Settings & Administration",
        "API Access",
    ])

    pdf.add_page()
    pdf.section("1. Accessing the Portal")
    pdf.body("The PayLock Pro Web Portal is accessible at:")
    pdf.body("https://api.paylock.pro/api/portal")
    pdf.numbered([
        "Open the URL in any modern web browser (Chrome, Firefox, Safari, Edge).",
        "Enter your admin username and password.",
        "Click 'Login' to access the dashboard.",
    ])
    pdf.note("The web portal provides the same features as the mobile admin app. Use either platform interchangeably - all data is synchronized in real-time.")

    pdf.section("2. Dashboard")
    pdf.body("The web dashboard provides a comprehensive overview of your loan portfolio:")
    pdf.bullet([
        "Total clients, active loans, and overdue accounts",
        "Monthly revenue and collection rate charts",
        "Recent activity feed showing latest payments and actions",
        "Quick action buttons for common tasks",
        "Device status summary (online, offline, locked)",
    ])

    pdf.section("3. Client Management")
    pdf.subsection("Adding Clients")
    pdf.body("Click 'Add Client' from the sidebar or dashboard. Fill in the client form with name, contact details, and optional device information.")
    pdf.subsection("Client Search & Filters")
    pdf.body("Use the search bar to find clients by name, phone, or email. Apply filters for payment status, device status, or loan amount.")
    pdf.subsection("Client Profile")
    pdf.body("Click any client to view their complete profile. From here you can:")
    pdf.bullet([
        "View and edit contact information",
        "Create new loans or modify existing ones",
        "Record payments and view payment history",
        "Lock/unlock their device remotely",
        "Upload documents to their vault",
        "View GPS location history",
        "Send messages via chat, Telegram, or WhatsApp",
    ])

    pdf.add_page()
    pdf.section("4. Loan Management")
    pdf.body("Create and manage loans from client profiles or the Loans section.")
    pdf.subsection("Creating a Loan")
    pdf.numbered([
        "Navigate to a client's profile.",
        "Click 'Create Loan'.",
        "Select a pre-configured loan plan or enter custom terms.",
        "Set the principal, interest rate, duration, and payment frequency.",
        "Review the auto-generated payment schedule.",
        "Click 'Create' to finalize.",
    ])
    pdf.subsection("Loan Status")
    pdf.body("Loans have the following statuses:")
    pdf.bullet([
        "Active: Loan is current with payments",
        "Overdue: One or more payments are past due",
        "Defaulted: Multiple missed payments past threshold",
        "Completed: Loan is fully repaid",
        "Restructured: Terms have been modified",
    ])

    pdf.section("5. Payment Processing")
    pdf.body("Record payments from the Payments section or within a client's loan view.")
    pdf.bullet([
        "Supports multiple payment methods: cash, bank transfer, Stripe, mobile money",
        "Automatic late fee calculation based on configurable rules",
        "Payment receipts generated automatically",
        "Bulk payment recording via CSV import (Enterprise)",
    ])

    pdf.add_page()
    pdf.section("6. Device Management")
    pdf.body("Manage client devices from the Device Management section.")
    pdf.subsection("Lock/Unlock")
    pdf.body("Select a client and choose Lock or Unlock. Add a custom message that displays on the client's device lock screen.")
    pdf.subsection("Auto-Lock Rules")
    pdf.body("Configure automatic locking based on payment status. Set grace periods and escalation rules.")
    pdf.subsection("Device Modes")
    pdf.bullet([
        "Device Admin: Standard mode with lock/unlock and notification capabilities",
        "Device Owner: Full control including app whitelisting, kiosk mode, and factory reset protection (Enterprise)",
    ])

    pdf.section("7. Reports & Exports")
    pdf.body("Generate reports from the Reports section.")
    pdf.bullet([
        "Financial Summary: Revenue, expenses, profit/loss",
        "Collection Trends: Payment rates over time",
        "Client Analytics: Health scores, risk distribution",
        "Portfolio Health: NPA ratios, risk scoring (Enterprise)",
        "Revenue Forecast: Predicted future collections (Enterprise)",
        "Export as PDF or CSV for offline analysis",
        "Schedule automated email reports (Enterprise)",
    ])

    pdf.add_page()
    pdf.section("8. Settings & Administration")
    pdf.subsection("User Management")
    pdf.body("Manage team members and their access levels:")
    pdf.bullet([
        "Super Admin: Full access to all features, can create admins and users",
        "Admin: Can create users, manage user plans, access most features",
        "User: Limited access based on assigned role (viewer, collections)",
    ])
    pdf.subsection("Plan Management")
    pdf.body("Super Admins and Admins can change subscription plans for their team members directly from the user management section.")
    pdf.subsection("Session Management")
    pdf.body("Monitor active sessions and revoke unauthorized access. Each session shows login time, IP address, and device information.")

    pdf.section("9. API Access (Enterprise)")
    pdf.body("Enterprise customers have full REST API access for custom integrations.")
    pdf.bullet([
        "API base URL: https://api.paylock.pro/api/",
        "Authentication: Token-based (obtained via /api/admin/login)",
        "Full CRUD operations for clients, loans, and payments",
        "Webhook support for real-time event notifications",
        "Rate limit: 1000 requests/minute",
    ])
    pdf.body("API documentation available at: https://api.paylock.pro/api/docs")

    pdf.output(os.path.join(OUT_DIR, "PayLockPro_WebPortal_Manual.pdf"))
    print("Web Portal manual generated.")


if __name__ == "__main__":
    gen_admin()
    gen_client()
    gen_portal()
    print(f"\nAll manuals saved to {OUT_DIR}/")
