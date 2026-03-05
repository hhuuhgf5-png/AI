from playwright.sync_api import sync_playwright

def verify_user_stats_card():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 400, 'height': 800})

        try:
            page.goto("http://localhost:3000")
            page.wait_for_timeout(5000)
            page.screenshot(path="verification_screenshot.png")
            print("Screenshot taken.")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_user_stats_card()
