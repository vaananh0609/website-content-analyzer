@echo off
echo Registering native host for Website Content Analyzer...
reg import "%~dp0register_host.reg"
echo Registration complete.
echo.
echo Next steps:
echo 1. Load the extension in Edge (edge://extensions/)
echo 2. Find the extension ID in the extension details
echo 3. Update the "allowed_origins" in com.website_content_analyzer.json
echo 4. Reload the extension
echo.
pause