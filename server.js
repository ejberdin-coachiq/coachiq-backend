<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CoachIQ - AI Basketball Scouting</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏀</text></svg>">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --orange: #FF6B35;
            --orange-dark: #E55A2B;
            --dark: #0D1117;
            --darker: #080B0F;
            --accent: #00D4AA;
            --accent-dark: #00B894;
            --gray: #21262D;
            --light-gray: #30363D;
            --text: #E6EDF3;
            --text-muted: #8B949E;
            --success: #00D4AA;
            --error: #FF6B6B;
            --warning: #FFB400;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--darker);
            color: var(--text);
            line-height: 1.6;
            min-height: 100vh;
        }

        /* Navigation */
        .nav {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 64px;
            background: rgba(8, 11, 15, 0.95);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--gray);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 24px;
        }

        .nav-left {
            display: flex;
            align-items: center;
            gap: 32px;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            text-decoration: none;
        }

        .logo-text {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 1.75rem;
            letter-spacing: 2px;
        }

        .logo-text span:first-child { color: var(--orange); }
        .logo-text span:last-child { color: var(--accent); }

        .nav-links {
            display: flex;
            gap: 8px;
        }

        .nav-link {
            padding: 8px 16px;
            color: var(--text-muted);
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.2s;
            border: none;
            background: none;
        }

        .nav-link:hover {
            color: var(--text);
            background: var(--gray);
        }

        .nav-right {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px 20px;
            font-size: 0.9rem;
            font-weight: 600;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            text-decoration: none;
        }

        .btn-ghost {
            background: transparent;
            color: var(--text-muted);
        }

        .btn-ghost:hover {
            background: var(--gray);
            color: var(--text);
        }

        .btn-secondary {
            background: var(--gray);
            color: var(--text);
            border: 1px solid var(--light-gray);
        }

        .btn-secondary:hover {
            background: var(--light-gray);
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--orange), #FF8E53);
            color: white;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(255, 107, 53, 0.4);
        }

        .btn-accent {
            background: linear-gradient(135deg, var(--accent), #00E6B8);
            color: var(--darker);
        }

        .btn-accent:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0, 212, 170, 0.4);
        }

        .btn-lg { padding: 14px 28px; font-size: 1rem; }
        .btn-sm { padding: 8px 14px; font-size: 0.85rem; }

        /* User Menu */
        .user-menu { position: relative; }

        .user-avatar {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--orange), var(--accent));
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 0.9rem;
            color: white;
            cursor: pointer;
            transition: transform 0.2s;
        }

        .user-avatar:hover { transform: scale(1.05); }

        .user-dropdown {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            background: var(--dark);
            border: 1px solid var(--light-gray);
            border-radius: 12px;
            min-width: 240px;
            padding: 8px;
            display: none;
            z-index: 100;
            box-shadow: 0 12px 40px rgba(0,0,0,0.5);
        }

        .user-dropdown.active { display: block; }

        .user-dropdown-header {
            padding: 12px;
            border-bottom: 1px solid var(--gray);
            margin-bottom: 8px;
        }

        .user-dropdown-header strong {
            display: block;
            font-size: 0.95rem;
        }

        .user-dropdown-header p {
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-top: 2px;
        }

        .plan-badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 50px;
            font-size: 0.7rem;
            font-weight: 700;
            margin-top: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .plan-badge.free { background: var(--gray); color: var(--text-muted); }
        .plan-badge.pro { background: rgba(255, 107, 53, 0.2); color: var(--orange); }

        .dropdown-item {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 10px 12px;
            border: none;
            background: none;
            color: var(--text);
            font-size: 0.9rem;
            border-radius: 8px;
            cursor: pointer;
            text-align: left;
            transition: background 0.2s;
        }

        .dropdown-item:hover { background: var(--gray); }

        .dropdown-item svg {
            width: 18px;
            height: 18px;
            color: var(--text-muted);
        }

        /* Main Content */
        .main {
            padding-top: 64px;
            min-height: 100vh;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 24px;
        }

        /* Hero */
        .hero {
            padding: 80px 0 60px;
            text-align: center;
        }

        .hero-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: rgba(255, 107, 53, 0.15);
            color: var(--orange);
            font-size: 0.85rem;
            font-weight: 600;
            border-radius: 50px;
            margin-bottom: 24px;
            border: 1px solid rgba(255, 107, 53, 0.3);
        }

        .hero h1 {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 4rem;
            letter-spacing: 2px;
            line-height: 1.1;
            margin-bottom: 20px;
        }

        .hero h1 .orange { color: var(--orange); }
        .hero h1 .accent { color: var(--accent); }

        .hero p {
            font-size: 1.25rem;
            color: var(--text-muted);
            max-width: 560px;
            margin: 0 auto 32px;
        }

        .hero-buttons {
            display: flex;
            gap: 16px;
            justify-content: center;
            flex-wrap: wrap;
        }

        /* Features */
        .features {
            padding: 60px 0;
        }

        .section-header {
            text-align: center;
            margin-bottom: 48px;
        }

        .section-header h2 {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 2.5rem;
            letter-spacing: 1px;
            margin-bottom: 12px;
        }

        .section-header p {
            color: var(--text-muted);
            font-size: 1.1rem;
        }

        .features-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
        }

        .feature-card {
            background: var(--dark);
            border: 1px solid var(--gray);
            border-radius: 16px;
            padding: 28px;
            transition: all 0.3s;
        }

        .feature-card:hover {
            border-color: var(--orange);
            transform: translateY(-4px);
            box-shadow: 0 12px 40px rgba(255, 107, 53, 0.1);
        }

        .feature-icon {
            width: 52px;
            height: 52px;
            background: linear-gradient(135deg, rgba(255, 107, 53, 0.2), rgba(0, 212, 170, 0.2));
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 16px;
            font-size: 1.5rem;
        }

        .feature-card h3 {
            font-size: 1.1rem;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .feature-card p {
            color: var(--text-muted);
            font-size: 0.9rem;
        }

        /* Cards */
        .card {
            background: var(--dark);
            border: 1px solid var(--gray);
            border-radius: 16px;
        }

        .card-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--gray);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .card-header h2 {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 1.5rem;
            letter-spacing: 1px;
        }

        .card-body {
            padding: 24px;
        }

        /* Upload Zone */
        .upload-zone {
            border: 2px dashed var(--light-gray);
            border-radius: 16px;
            padding: 48px 24px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            background: rgba(33, 38, 45, 0.5);
        }

        .upload-zone:hover,
        .upload-zone.dragover {
            border-color: var(--orange);
            background: rgba(255, 107, 53, 0.05);
        }

        .upload-icon {
            width: 72px;
            height: 72px;
            background: var(--gray);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            font-size: 2rem;
        }

        .upload-zone h3 {
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .upload-zone p {
            color: var(--text-muted);
            font-size: 0.9rem;
        }

        .upload-formats {
            display: flex;
            gap: 8px;
            justify-content: center;
            margin-top: 16px;
        }

        .format-tag {
            padding: 6px 12px;
            background: var(--darker);
            border: 1px solid var(--gray);
            border-radius: 6px;
            font-size: 0.75rem;
            color: var(--text-muted);
            font-weight: 600;
        }

        input[type="file"] { display: none; }

        /* Forms */
        .form-group { margin-bottom: 20px; }

        .form-label {
            display: block;
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--text);
        }

        .form-input {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid var(--light-gray);
            border-radius: 10px;
            font-size: 0.95rem;
            background: var(--darker);
            color: var(--text);
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        .form-input:focus {
            outline: none;
            border-color: var(--orange);
            box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.2);
        }

        .form-input::placeholder { color: var(--text-muted); }

        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }

        /* Options Grid */
        .options-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin: 20px 0;
        }

        .option {
            background: var(--darker);
            border: 1px solid var(--gray);
            border-radius: 12px;
            padding: 16px 12px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }

        .option:hover { border-color: var(--orange); }

        .option.selected {
            border-color: var(--orange);
            background: rgba(255, 107, 53, 0.1);
        }

        .option-icon {
            font-size: 1.5rem;
            margin-bottom: 8px;
        }

        .option-label {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-muted);
        }

        .option.selected .option-label { color: var(--orange); }

        /* Alerts */
        .alert {
            padding: 14px 18px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
            font-size: 0.9rem;
        }

        .alert-info {
            background: rgba(139, 148, 158, 0.1);
            border: 1px solid var(--gray);
            color: var(--text-muted);
        }

        .alert-success {
            background: rgba(0, 212, 170, 0.1);
            border: 1px solid rgba(0, 212, 170, 0.3);
            color: var(--accent);
        }

        .alert-warning {
            background: rgba(255, 180, 0, 0.1);
            border: 1px solid rgba(255, 180, 0, 0.3);
            color: var(--warning);
        }

        .alert-error {
            background: rgba(255, 107, 107, 0.1);
            border: 1px solid rgba(255, 107, 107, 0.3);
            color: var(--error);
        }

        /* Pricing */
        .pricing-section { padding: 80px 0; }

        .pricing-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
            max-width: 1000px;
            margin: 0 auto;
        }

        .pricing-card {
            background: var(--dark);
            border: 1px solid var(--gray);
            border-radius: 20px;
            padding: 32px;
            position: relative;
            transition: all 0.3s;
        }

        .pricing-card:hover {
            border-color: var(--light-gray);
            transform: translateY(-4px);
        }

        .pricing-card.featured {
            border-color: var(--orange);
            box-shadow: 0 0 40px rgba(255, 107, 53, 0.2);
        }

        .pricing-card.featured::before {
            content: 'MOST POPULAR';
            position: absolute;
            top: -12px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, var(--orange), #FF8E53);
            color: white;
            padding: 6px 16px;
            border-radius: 50px;
            font-size: 0.7rem;
            font-weight: 700;
            letter-spacing: 0.5px;
        }

        .pricing-card h3 {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 1.5rem;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }

        .pricing-card .price {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 3.5rem;
            color: var(--orange);
            margin: 16px 0;
        }

        .pricing-card .price span {
            font-family: 'DM Sans', sans-serif;
            font-size: 1rem;
            color: var(--text-muted);
        }

        .pricing-card .price-note {
            color: var(--text-muted);
            font-size: 0.9rem;
            margin-bottom: 24px;
        }

        .pricing-features {
            list-style: none;
            margin-bottom: 24px;
        }

        .pricing-features li {
            padding: 10px 0;
            display: flex;
            align-items: center;
            gap: 12px;
            color: var(--text-muted);
            font-size: 0.9rem;
        }

        .pricing-features li .check { color: var(--accent); }
        .pricing-features li .x { color: var(--text-muted); opacity: 0.5; }

        /* Video Preview */
        .video-preview {
            border-radius: 12px;
            overflow: hidden;
            background: var(--darker);
            margin: 20px 0;
            border: 1px solid var(--gray);
        }

        .video-preview video {
            width: 100%;
            max-height: 280px;
            display: block;
        }

        .video-info {
            padding: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--dark);
            border-top: 1px solid var(--gray);
        }

        .video-name { font-weight: 600; font-size: 0.9rem; }
        .video-size { color: var(--text-muted); font-size: 0.85rem; }

        /* Progress */
        .progress-bar {
            height: 10px;
            background: var(--gray);
            border-radius: 5px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--orange), var(--accent));
            border-radius: 5px;
            transition: width 0.3s;
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin: 24px 0;
        }

        .stat-box {
            background: var(--gray);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
        }

        .stat-label {
            font-size: 0.7rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }

        .stat-value {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 1.75rem;
            color: var(--text);
        }

        .stat-value.orange { color: var(--orange); }
        .stat-value.accent { color: var(--accent); }

        /* Report Sections */
        .report-section {
            border: 1px solid var(--gray);
            border-radius: 12px;
            margin-bottom: 20px;
            overflow: hidden;
        }

        .report-section-header {
            background: var(--gray);
            padding: 14px 20px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.95rem;
        }

        .report-section-body {
            padding: 20px;
        }

        .report-item {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid var(--gray);
        }

        .report-item:last-child { border-bottom: none; }

        .report-item-value {
            font-weight: 700;
            color: var(--orange);
        }

        /* Practice Plan Section */
        .practice-drill {
            background: var(--darker);
            border: 1px solid var(--gray);
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 12px;
        }

        .practice-drill-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .practice-drill-name {
            font-weight: 700;
            color: var(--orange);
        }

        .practice-drill-duration {
            font-size: 0.85rem;
            color: var(--accent);
            background: rgba(0, 212, 170, 0.1);
            padding: 4px 10px;
            border-radius: 50px;
        }

        .practice-drill-purpose {
            color: var(--text-muted);
            font-size: 0.9rem;
            margin-bottom: 10px;
        }

        .practice-drill-points {
            font-size: 0.85rem;
            color: var(--text);
        }

        .practice-drill-points li {
            padding: 4px 0;
        }

        .scout-team-look {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid var(--gray);
            font-size: 0.85rem;
            color: var(--warning);
        }

        /* Dashboard Reports List */
        .reports-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .report-card {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            background: var(--darker);
            border: 1px solid var(--gray);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .report-card:hover {
            border-color: var(--orange);
            background: rgba(255, 107, 53, 0.05);
        }

        .report-card h4 {
            font-size: 1rem;
            font-weight: 700;
            margin-bottom: 4px;
        }

        .report-card p {
            font-size: 0.85rem;
            color: var(--text-muted);
        }

        .status-badge {
            padding: 6px 14px;
            border-radius: 50px;
            font-size: 0.8rem;
            font-weight: 600;
        }

        .status-complete { background: rgba(0, 212, 170, 0.2); color: var(--accent); }
        .status-processing { background: rgba(255, 107, 53, 0.2); color: var(--orange); }
        .status-queued { background: var(--gray); color: var(--text-muted); }
        .status-failed { background: rgba(255, 107, 107, 0.2); color: var(--error); }

        /* Success Screen */
        .success-screen {
            text-align: center;
            padding: 60px 20px;
        }

        .success-icon {
            width: 80px;
            height: 80px;
            background: rgba(0, 212, 170, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 2.5rem;
        }

        .success-screen h2 {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 2rem;
            letter-spacing: 1px;
            margin-bottom: 12px;
        }

        .success-screen p {
            color: var(--text-muted);
            margin-bottom: 32px;
        }

        /* Modal */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            padding: 20px;
        }

        .modal-overlay.active { display: flex; }

        .modal {
            background: var(--dark);
            border: 1px solid var(--gray);
            border-radius: 20px;
            padding: 32px;
            max-width: 420px;
            width: 100%;
            position: relative;
        }

        .modal-close {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 32px;
            height: 32px;
            border: none;
            background: var(--gray);
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            font-size: 1.2rem;
        }

        .modal-close:hover { background: var(--light-gray); color: var(--text); }

        .modal h2 {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 1.75rem;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }

        .modal > p {
            color: var(--text-muted);
            margin-bottom: 24px;
        }

        .auth-tabs {
            display: flex;
            gap: 4px;
            background: var(--darker);
            padding: 4px;
            border-radius: 10px;
            margin-bottom: 24px;
        }

        .auth-tab {
            flex: 1;
            padding: 10px;
            border: none;
            background: transparent;
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--text-muted);
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.2s;
        }

        .auth-tab.active {
            background: var(--gray);
            color: var(--text);
        }

        /* Upload Banner */
        .upload-banner {
            position: fixed;
            top: 64px;
            left: 0;
            right: 0;
            background: var(--dark);
            border-bottom: 1px solid var(--gray);
            padding: 12px 24px;
            z-index: 900;
            display: none;
        }

        .upload-banner.active { display: block; }

        .upload-banner-content {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            gap: 24px;
        }

        .upload-banner-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .upload-banner-icon {
            width: 44px;
            height: 44px;
            background: rgba(255, 107, 53, 0.2);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
        }

        .upload-banner-text h4 { font-size: 0.9rem; font-weight: 700; }
        .upload-banner-text p { font-size: 0.8rem; color: var(--text-muted); }

        .upload-banner-progress { flex: 1; max-width: 300px; }

        .upload-banner-stats {
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 6px;
        }

        body.uploading .main { padding-top: 124px; }

        /* Spinner */
        .spinner {
            width: 36px;
            height: 36px;
            border: 3px solid var(--gray);
            border-top-color: var(--orange);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* Toast */
        .toast-container {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 3000;
        }

        .toast {
            background: var(--dark);
            border: 1px solid var(--gray);
            border-radius: 10px;
            padding: 14px 20px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            gap: 12px;
            margin-top: 12px;
            animation: slideIn 0.3s;
        }

        .toast.success { border-left: 4px solid var(--accent); }
        .toast.error { border-left: 4px solid var(--error); }

        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        /* Footer */
        .footer {
            border-top: 1px solid var(--gray);
            padding: 40px 24px;
            text-align: center;
            color: var(--text-muted);
            font-size: 0.9rem;
        }

        .footer a {
            color: var(--text-muted);
            text-decoration: none;
        }

        .footer a:hover { color: var(--orange); }

        /* Highlight Box */
        .highlight-box {
            background: linear-gradient(135deg, rgba(255, 107, 53, 0.15), rgba(0, 212, 170, 0.1));
            border: 2px solid var(--orange);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .highlight-box-title {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 1rem;
            letter-spacing: 0.5px;
            color: var(--orange);
            margin-bottom: 8px;
        }

        /* Breakdown Card */
        .breakdown-card {
            background: var(--darker);
            border: 1px solid var(--gray);
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 12px;
        }

        .breakdown-card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .breakdown-card-title { font-weight: 700; }
        .breakdown-card-value { color: var(--accent); font-weight: 700; }

        /* Section Hidden */
        .section-hidden { display: none; }

        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 60px 20px;
        }

        .empty-state-icon {
            width: 72px;
            height: 72px;
            background: var(--gray);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            font-size: 2rem;
        }

        .empty-state h3 {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 1.5rem;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }

        .empty-state p {
            color: var(--text-muted);
            margin-bottom: 24px;
        }

        /* Responsive */
        @media (max-width: 900px) {
            .features-grid { grid-template-columns: repeat(2, 1fr); }
            .pricing-grid { grid-template-columns: 1fr; max-width: 400px; }
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 768px) {
            .nav-links { display: none; }
            .hero h1 { font-size: 2.5rem; }
            .features-grid { grid-template-columns: 1fr; }
            .form-row { grid-template-columns: 1fr; }
            .options-grid { grid-template-columns: repeat(2, 1fr); }
        }
    </style>
<!-- PDF Generation Library -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
</head>
<body>
    <!-- Upload Banner -->
    <div class="upload-banner" id="upload-banner">
        <div class="upload-banner-content">
            <div class="upload-banner-info">
                <div class="upload-banner-icon">📤</div>
                <div class="upload-banner-text">
                    <h4 id="banner-title">Uploading video...</h4>
                    <p id="banner-subtitle">You can keep browsing</p>
                </div>
            </div>
            <div class="upload-banner-progress">
                <div class="progress-bar"><div class="progress-fill" id="banner-progress-fill"></div></div>
                <div class="upload-banner-stats"><span id="banner-percent">0%</span><span id="banner-speed">--</span></div>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="minimizeBanner()">Minimize</button>
        </div>
    </div>

    <!-- Navigation -->
    <nav class="nav">
        <div class="nav-left">
            <a class="logo" onclick="showSection('home')">
                <div class="logo-text"><span>COACH</span><span>IQ</span></div>
            </a>
            <div class="nav-links">
                <button class="nav-link" onclick="showSection('home')">Home</button>
                <button class="nav-link" onclick="showSection('pricing')">Pricing</button>
                <button class="nav-link" id="nav-dashboard" onclick="showSection('dashboard')" style="display: none;">Dashboard</button>
            </div>
        </div>
        <div class="nav-right" id="auth-buttons">
            <button class="btn btn-ghost" onclick="openAuthModal('login')">Sign In</button>
            <button class="btn btn-primary" onclick="openAuthModal('signup')">Get Started Free</button>
        </div>
        <div class="user-menu" id="user-section" style="display: none;">
            <div class="user-avatar" onclick="toggleUserMenu()"><span id="user-initial">C</span></div>
            <div class="user-dropdown" id="user-dropdown">
                <div class="user-dropdown-header">
                    <strong id="user-dropdown-name">Coach</strong>
                    <p id="user-dropdown-email"><a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="5f3c303e3c371f3a323e3633713c3032">[email&#160;protected]</a></p>
                    <span class="plan-badge free" id="user-plan-badge">FREE TRIAL</span>
                </div>
                <button class="dropdown-item" onclick="showSection('dashboard')">📊 My Reports</button>
                <button class="dropdown-item" onclick="showSection('analyze')">➕ New Report</button>
                <button class="dropdown-item" onclick="showSection('pricing')">⭐ Upgrade Plan</button>
                <button class="dropdown-item" onclick="logout()">🚪 Sign Out</button>
            </div>
        </div>
    </nav>

    <main class="main">
        <div class="container">
            <!-- HOME -->
            <section id="home-section">
                <div class="hero">
                    <div class="hero-badge">⚡ AI-Powered Scouting for Every Level</div>
                    <h1>TURN GAME FILM INTO<br><span class="orange">WINNING</span> <span class="accent">GAME PLANS</span></h1>
                    <p>Upload opponent film and get professional scouting reports in minutes. Track offensive sets, ball movement, pace, and more.</p>
                    <div class="hero-buttons">
                        <button class="btn btn-primary btn-lg" onclick="showSection('analyze')">🏀 Start Analyzing Free</button>
                        <button class="btn btn-secondary btn-lg" onclick="showSection('pricing')">View Pricing</button>
                    </div>
                </div>

                <div class="features">
                    <div class="section-header">
                        <h2>EVERYTHING YOU NEED TO SCOUT SMARTER</h2>
                        <p>Professional-grade analysis accessible to coaches at every level</p>
                    </div>
                    <div class="features-grid">
                        <div class="feature-card">
                            <div class="feature-icon">🛡️</div>
                            <h3>Defensive Analysis</h3>
                            <p>Identify man, zone, press, and combination defenses. See ball screen coverages and help rotations.</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon">⚡</div>
                            <h3>Offensive Sets & PPP</h3>
                            <p>Track 60+ offensive sets with Points Per Possession. Know which plays work and which don't.</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon">🔄</div>
                            <h3>Ball Movement</h3>
                            <p>Track reversals per possession, passes before shots, and identify stagnation tendencies.</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon">⏱️</div>
                            <h3>Pace & Tempo</h3>
                            <p>Estimate possessions per game, shot clock usage, and transition tendencies.</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon">🔥</div>
                            <h3>Turnover Analysis</h3>
                            <p>See how turnovers become scores. Live ball vs dead ball conversion rates.</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon">📋</div>
                            <h3>Practice Plans</h3>
                            <p>Get specific drills with scout team instructions tailored to exploit opponent weaknesses.</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- PRICING -->
            <section id="pricing-section" class="section-hidden">
                <div class="pricing-section">
                    <div class="section-header">
                        <h2>SIMPLE, TRANSPARENT PRICING</h2>
                        <p>Start free, upgrade when you need more</p>
                    </div>
                    <div class="pricing-grid">
                        <div class="pricing-card">
                            <h3>FREE</h3>
                            <div class="price">$0<span>/forever</span></div>
                            <p class="price-note">Perfect for trying it out</p>
                            <ul class="pricing-features">
                                <li><span class="check">✓</span> 3 scouting reports</li>
                                <li><span class="check">✓</span> Full AI analysis</li>
                                <li><span class="check">✓</span> Email delivery</li>
                                <li><span class="x">✗</span> Unlimited reports</li>
                                <li><span class="x">✗</span> Priority processing</li>
                            </ul>
                            <button class="btn btn-secondary" style="width: 100%;" onclick="openAuthModal('signup')">Get Started Free</button>
                        </div>
                        <div class="pricing-card featured">
                            <h3>PRO MONTHLY</h3>
                            <div class="price">$49<span>/month</span></div>
                            <p class="price-note">For active coaches</p>
                            <ul class="pricing-features">
                                <li><span class="check">✓</span> Unlimited reports</li>
                                <li><span class="check">✓</span> Full AI analysis</li>
                                <li><span class="check">✓</span> Email delivery</li>
                                <li><span class="check">✓</span> Priority processing</li>
                                <li><span class="check">✓</span> PDF exports</li>
                            </ul>
                            <button class="btn btn-primary" style="width: 100%;" onclick="subscribe('monthly')">Subscribe Now</button>
                        </div>
                        <div class="pricing-card">
                            <h3>PRO YEARLY</h3>
                            <div class="price">$399<span>/year</span></div>
                            <p class="price-note">Save $189 (32% off)</p>
                            <ul class="pricing-features">
                                <li><span class="check">✓</span> Unlimited reports</li>
                                <li><span class="check">✓</span> Full AI analysis</li>
                                <li><span class="check">✓</span> Email delivery</li>
                                <li><span class="check">✓</span> Priority processing</li>
                                <li><span class="check">✓</span> PDF exports</li>
                            </ul>
                            <button class="btn btn-accent" style="width: 100%;" onclick="subscribe('yearly')">Subscribe & Save</button>
                        </div>
                    </div>
                </div>
            </section>

            <!-- ANALYZE -->
            <section id="analyze-section" class="section-hidden">
                <div style="max-width: 640px; margin: 40px auto;">
                    <div class="card">
                        <div class="card-header">
                            <h2>🏀 NEW SCOUTING REPORT</h2>
                            <button class="btn btn-sm btn-ghost" onclick="showSection('home')">← Back</button>
                        </div>
                        <div class="card-body">
                            <div id="step-upload">
                                <p style="color: var(--text-muted); margin-bottom: 20px;">Upload your opponent's game film to generate an AI scouting report with set efficiency, ball movement, and practice plans.</p>
                                <div class="upload-zone" id="upload-zone">
                                    <div class="upload-icon">🎬</div>
                                    <h3>Drop your game film here</h3>
                                    <p>or click to browse</p>
                                    <div class="upload-formats">
                                        <span class="format-tag">MP4</span>
                                        <span class="format-tag">MOV</span>
                                        <span class="format-tag">AVI</span>
                                    </div>
                                </div>
                                <input type="file" id="file-input" accept="video/*">
                                <div class="video-preview" id="video-preview" style="display: none;">
                                    <video id="preview-video" controls></video>
                                    <div class="video-info">
                                        <div>
                                            <span class="video-name" id="video-name"></span>
                                            <span class="video-size" id="video-size"></span>
                                        </div>
                                        <button class="btn btn-sm btn-ghost" onclick="clearVideo()">✕ Remove</button>
                                    </div>
                                </div>
                                <button class="btn btn-primary" style="width: 100%; margin-top: 20px;" id="continue-btn" onclick="goToStep2()" disabled>Continue →</button>
                            </div>
                            
                            <div id="step-details" style="display: none;">
                                <button class="btn btn-sm btn-ghost" onclick="goToStep1()" style="margin-bottom: 20px;">← Back to upload</button>
                                
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">Opponent Name</label>
                                        <input type="text" class="form-input" id="opponent-name" placeholder="Central High Tigers">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Your Team Name</label>
                                        <input type="text" class="form-input" id="your-team-name" placeholder="East Side Eagles">
                                    </div>
                                </div>

                                <!-- Team Color Selection -->
                                <div style="background: var(--dark); border: 1px solid var(--gray); border-radius: 12px; padding: 20px; margin: 20px 0;">
                                    <p style="font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                                        <span style="font-size: 1.25rem;">👕</span> Team Jersey Colors
                                    </p>
                                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 16px;">
                                        Help us identify which team is which in the video. Select the primary jersey colors.
                                    </p>
                                    
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label class="form-label" style="color: var(--error);">🎯 Opponent Jersey Color</label>
                                            <div class="color-picker-group">
                                                <select class="form-input" id="opponent-color" style="flex: 1;">
                                                    <option value="">Select color...</option>
                                                    <option value="white">⚪ White</option>
                                                    <option value="black">⚫ Black</option>
                                                    <option value="red">🔴 Red</option>
                                                    <option value="blue">🔵 Blue</option>
                                                    <option value="navy">🔵 Navy Blue</option>
                                                    <option value="light-blue">🩵 Light Blue</option>
                                                    <option value="green">🟢 Green</option>
                                                    <option value="dark-green">🟢 Dark Green</option>
                                                    <option value="yellow">🟡 Yellow/Gold</option>
                                                    <option value="orange">🟠 Orange</option>
                                                    <option value="purple">🟣 Purple</option>
                                                    <option value="maroon">🟤 Maroon/Burgundy</option>
                                                    <option value="gray">⚪ Gray</option>
                                                    <option value="pink">🩷 Pink</option>
                                                </select>
                                            </div>
                                            <input type="text" class="form-input" id="opponent-color-custom" placeholder="Or type custom color (e.g., 'teal with white trim')" style="margin-top: 8px; font-size: 0.85rem;">
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label" style="color: var(--accent);">🏠 Your Team Jersey Color</label>
                                            <div class="color-picker-group">
                                                <select class="form-input" id="your-color" style="flex: 1;">
                                                    <option value="">Select color...</option>
                                                    <option value="white">⚪ White</option>
                                                    <option value="black">⚫ Black</option>
                                                    <option value="red">🔴 Red</option>
                                                    <option value="blue">🔵 Blue</option>
                                                    <option value="navy">🔵 Navy Blue</option>
                                                    <option value="light-blue">🩵 Light Blue</option>
                                                    <option value="green">🟢 Green</option>
                                                    <option value="dark-green">🟢 Dark Green</option>
                                                    <option value="yellow">🟡 Yellow/Gold</option>
                                                    <option value="orange">🟠 Orange</option>
                                                    <option value="purple">🟣 Purple</option>
                                                    <option value="maroon">🟤 Maroon/Burgundy</option>
                                                    <option value="gray">⚪ Gray</option>
                                                    <option value="pink">🩷 Pink</option>
                                                </select>
                                            </div>
                                            <input type="text" class="form-input" id="your-color-custom" placeholder="Or type custom color (e.g., 'blue with gold trim')" style="margin-top: 8px; font-size: 0.85rem;">
                                        </div>
                                    </div>
                                </div>

                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">Your Email</label>
                                        <input type="email" class="form-input" id="user-email" placeholder="coach@school.edu">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Your Name (optional)</label>
                                        <input type="text" class="form-input" id="user-name" placeholder="Coach Johnson">
                                    </div>
                                </div>
                                
                                <label class="form-label" style="margin-top: 24px;">What to Analyze</label>
                                <div class="options-grid">
                                    <div class="option selected" data-option="defense" onclick="this.classList.toggle('selected')">
                                        <div class="option-icon">🛡️</div>
                                        <div class="option-label">Defense</div>
                                    </div>
                                    <div class="option selected" data-option="offense" onclick="this.classList.toggle('selected')">
                                        <div class="option-icon">⚡</div>
                                        <div class="option-label">Offense</div>
                                    </div>
                                    <div class="option" data-option="players" onclick="this.classList.toggle('selected')">
                                        <div class="option-icon">👤</div>
                                        <div class="option-label">Players</div>
                                    </div>
                                    <div class="option selected" data-option="pace" onclick="this.classList.toggle('selected')">
                                        <div class="option-icon">⏱️</div>
                                        <div class="option-label">Pace</div>
                                    </div>
                                </div>
                                <div class="alert alert-info">
                                    ℹ️ After you submit, you can browse freely. We'll email you when your report is ready.
                                </div>
                                <button class="btn btn-primary" style="width: 100%;" onclick="startBackgroundUpload()">🚀 Upload & Analyze</button>
                            </div>
                            
                            <div id="step-success" style="display: none;">
                                <div class="success-screen">
                                    <div class="success-icon">✓</div>
                                    <h2>UPLOAD STARTED!</h2>
                                    <p>We'll email you at <strong id="confirm-email"></strong> when your report is ready.</p>
                                    <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                                        <button class="btn btn-primary" onclick="showSection('dashboard')">View Dashboard</button>
                                        <button class="btn btn-secondary" onclick="showSection('home')">Go Home</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- DASHBOARD -->
            <section id="dashboard-section" class="section-hidden">
                <div style="max-width: 800px; margin: 40px auto;">
                    <div class="card">
                        <div class="card-header">
                            <h2>📊 MY REPORTS</h2>
                            <button class="btn btn-sm btn-primary" onclick="showSection('analyze')">+ New Report</button>
                        </div>
                        <div class="card-body">
                            <div id="dashboard-loading" style="text-align: center; padding: 40px;">
                                <div class="spinner" style="margin: 0 auto 16px;"></div>
                                <p style="color: var(--text-muted);">Loading reports...</p>
                            </div>
                            <div id="dashboard-empty" style="display: none;">
                                <div class="empty-state">
                                    <div class="empty-state-icon">📋</div>
                                    <h3>NO REPORTS YET</h3>
                                    <p>Upload your first game film to get started.</p>
                                    <button class="btn btn-primary" onclick="showSection('analyze')">Create Your First Report</button>
                                </div>
                            </div>
                            <div id="dashboard-reports" class="reports-list" style="display: none;"></div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- VIEW REPORT -->
            <section id="report-section" class="section-hidden">
                <div style="max-width: 900px; margin: 40px auto;">
                    <div class="card">
                        <div class="card-header">
                            <h2 id="view-report-title">📋 SCOUTING REPORT</h2>
                            <button class="btn btn-sm btn-ghost" onclick="showSection('dashboard')">← Back</button>
                        </div>
                        <div class="card-body">
                            <div id="report-loading" style="text-align: center; padding: 40px;">
                                <div class="spinner" style="margin: 0 auto;"></div>
                            </div>
                            <div id="report-processing" style="display: none; text-align: center; padding: 40px;">
                                <div class="spinner" style="margin: 0 auto 20px;"></div>
                                <h3 style="margin-bottom: 8px;">Analyzing video...</h3>
                                <p style="color: var(--text-muted); margin-bottom: 24px;" id="report-processing-text">Processing...</p>
                                <div style="max-width: 300px; margin: 0 auto;">
                                    <div class="progress-bar"><div class="progress-fill" id="report-progress-fill"></div></div>
                                </div>
                            </div>
                            <div id="report-content" style="display: none;">
                                <!-- Opponent Banner -->
                                <div id="opponent-banner" style="background: linear-gradient(135deg, var(--orange), #FF8E53); border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
                                    <p style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9; margin-bottom: 4px;">SCOUTING REPORT FOR</p>
                                    <h2 id="opponent-banner-name" style="font-family: 'Bebas Neue', sans-serif; font-size: 2rem; letter-spacing: 2px; margin: 0;">OPPONENT</h2>
                                    <p id="opponent-banner-color" style="font-size: 0.85rem; opacity: 0.9; margin-top: 4px;"></p>
                                </div>
                                
                                <div class="alert alert-success" style="margin-bottom: 24px;">
                                    ✓ Analysis complete — All stats below are for the <strong>OPPONENT</strong> team
                                </div>
                                
                                <!-- Team Identification Banner -->
                                <div id="team-info-banner" style="display: none; background: var(--gray); border: 1px solid var(--light-gray); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                                    <p style="font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                                        <span style="font-size: 1.25rem;">🎽</span> TEAM IDENTIFICATION
                                    </p>
                                    <div style="display: flex; gap: 24px; flex-wrap: wrap;">
                                        <div style="flex: 1; min-width: 150px; background: rgba(255,107,53,0.1); padding: 12px; border-radius: 8px; border-left: 3px solid var(--orange);">
                                            <p style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">🎯 Scouted Team (Opponent)</p>
                                            <p style="font-weight: 600;"><span id="team-opponent-color" style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; vertical-align: middle;"></span><span id="team-opponent-name">--</span></p>
                                        </div>
                                        <div style="flex: 1; min-width: 150px; background: rgba(0,212,170,0.1); padding: 12px; border-radius: 8px; border-left: 3px solid var(--accent);">
                                            <p style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">🏠 Your Team</p>
                                            <p style="font-weight: 600;"><span id="team-your-color" style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; vertical-align: middle;"></span><span id="team-your-name">--</span></p>
                                        </div>
                                    </div>
                                </div>
                                
                                <p style="color: var(--text-muted); margin-bottom: 24px; font-size: 0.9rem;" id="report-date"></p>
                                
                                <!-- Top Stats - Opponent -->
                                <p style="font-weight: 700; margin-bottom: 12px; color: var(--orange); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;">📊 OPPONENT STATISTICS</p>
                                <div class="stats-grid">
                                    <div class="stat-box"><div class="stat-label">Their Defense</div><div class="stat-value" id="stat-defense">--</div></div>
                                    <div class="stat-box"><div class="stat-label">Their Pace</div><div class="stat-value orange" id="stat-pace">--</div></div>
                                    <div class="stat-box"><div class="stat-label">Their Poss/Game</div><div class="stat-value accent" id="stat-possessions">--</div></div>
                                    <div class="stat-box"><div class="stat-label">Their Reversals/Poss</div><div class="stat-value" id="stat-reversals">--</div></div>
                                </div>
                                <div class="stats-grid" style="margin-top: 12px;">
                                    <div class="stat-box"><div class="stat-label">Their Passes/Shot</div><div class="stat-value accent" id="stat-passes">--</div></div>
                                    <div class="stat-box"><div class="stat-label">Their TO → Score</div><div class="stat-value orange" id="stat-toconversion">--</div></div>
                                    <div class="stat-box"><div class="stat-label">Frames Analyzed</div><div class="stat-value" id="stat-frames">--</div></div>
                                    <div class="stat-box"><div class="stat-label">AI Confidence</div><div class="stat-value accent" id="stat-confidence">--</div></div>
                                </div>

                                <!-- Must Stop Box -->
                                <div id="must-stop-box" class="highlight-box" style="margin-top: 24px; display: none;">
                                    <div class="highlight-box-title">🎯 OPPONENT'S #1 WEAPON — MUST STOP TO WIN</div>
                                    <p id="must-stop-text" style="font-size: 1.1rem; font-weight: 500;"></p>
                                </div>

                                <!-- Report Sections -->
                                <div class="report-section">
                                    <div class="report-section-header">🛡️ OPPONENT'S DEFENSE</div>
                                    <div class="report-section-body" id="defense-breakdown"></div>
                                </div>
                                <div class="report-section">
                                    <div class="report-section-header">⚡ OPPONENT'S OFFENSE</div>
                                    <div class="report-section-body" id="offense-breakdown"></div>
                                </div>
                                <div class="report-section">
                                    <div class="report-section-header">📊 OPPONENT'S SET EFFICIENCY & BALL MOVEMENT</div>
                                    <div class="report-section-body" id="efficiency-breakdown"></div>
                                </div>
                                <div class="report-section">
                                    <div class="report-section-header">⏱️ OPPONENT'S PACE, TEMPO & TURNOVERS</div>
                                    <div class="report-section-body" id="pace-breakdown"></div>
                                </div>
                                <div class="report-section">
                                    <div class="report-section-header">🌟 OPPONENT'S KEY VALUE & X-FACTOR</div>
                                    <div class="report-section-body" id="value-breakdown"></div>
                                </div>
                                <div class="report-section">
                                    <div class="report-section-header">👤 OPPONENT'S KEY PLAYERS</div>
                                    <div class="report-section-body" id="players-breakdown"></div>
                                </div>
                                <div class="report-section">
                                    <div class="report-section-header">📋 YOUR PRACTICE PLAN</div>
                                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">Drills to prepare YOUR team against this opponent</p>
                                    <div class="report-section-body" id="practice-breakdown"></div>
                                </div>
                                <div class="report-section">
                                    <div class="report-section-header">💡 YOUR GAME PLAN</div>
                                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">How YOUR team should play against this opponent</p>
                                    <div class="report-section-body" id="recommendations"></div>
                                </div>
                                
                                <!-- Download & Share Actions -->
                                <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--gray);">
                                    <p style="font-weight: 700; margin-bottom: 16px;">📥 EXPORT REPORT</p>
                                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                                        <button class="btn btn-primary" onclick="downloadPDF()">
                                            📄 Download PDF
                                        </button>
                                        <button class="btn btn-secondary" onclick="printReport()">
                                            🖨️ Print Report
                                        </button>
                                        <button class="btn btn-secondary" onclick="copyReportLink()">
                                            🔗 Copy Link
                                        </button>
                                    </div>
                                    <p style="color: var(--text-muted); font-size: 0.8rem; margin-top: 12px;">
                                        💡 Pro tip: Share the PDF with your assistant coaches before practice
                                    </p>
                                </div>
                            </div>
                            <div id="report-error" style="display: none;" class="alert alert-error">
                                <span id="report-error-message">Analysis failed</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </main>

    <footer class="footer">
        <p>© 2026 CoachIQ · <a href="#" onclick="showSection('pricing')">Pricing</a> · <a href="/cdn-cgi/l/email-protection#8ffcfaffffe0fdfbcfece0eeece7e6fea1ece0e2">Support</a></p>
    </footer>

    <!-- Auth Modal -->
    <div class="modal-overlay" id="auth-modal">
        <div class="modal">
            <button class="modal-close" onclick="closeAuthModal()">✕</button>
            <h2>WELCOME TO COACHIQ</h2>
            <p>Start scouting smarter with AI</p>
            <div class="auth-tabs">
                <button class="auth-tab" id="tab-login" onclick="switchAuthTab('login')">Sign In</button>
                <button class="auth-tab active" id="tab-signup" onclick="switchAuthTab('signup')">Sign Up</button>
            </div>
            <form onsubmit="handleAuth(event)">
                <div class="form-group" id="name-group">
                    <label class="form-label">Name</label>
                    <input type="text" class="form-input" id="auth-name" placeholder="Coach Johnson">
                </div>
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" class="form-input" id="auth-email" placeholder="coach@school.edu" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Password</label>
                    <input type="password" class="form-input" id="auth-password" placeholder="••••••••" required minlength="6">
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%;" id="auth-submit-btn">Create Account</button>
            </form>
        </div>
    </div>

    <div class="toast-container" id="toast-container"></div>

    <script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script><script>
        var CONFIG = { API_URL: 'https://api.meetyournewstatscoach.com', CHUNK_SIZE: 5 * 1024 * 1024 };
        var currentUser = null, currentVideo = null, viewingReportId = null, reportPollInterval = null;
        var backgroundUpload = { active: false };
        var authMode = 'signup';
        var isPolling = false; // Prevent overlapping requests
        var pollRetryCount = 0;
        var MAX_POLL_RETRIES = 60; // Stop after 3 minutes (60 * 3 seconds)

        // ===========================================
        // PDF EXPORT FUNCTIONS
        // ===========================================
        
        var currentReportData = null; // Store report data for PDF generation
        
        function downloadPDF() {
            if (!currentReportData) {
                showToast('No report loaded', 'error');
                return;
            }
            
            showToast('Generating PDF...');
            
            // Create a printable version of the report
            var pdfContent = generatePDFContent(currentReportData);
            
            // Create temporary container
            var container = document.createElement('div');
            container.innerHTML = pdfContent;
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.top = '0';
            container.style.width = '800px';
            document.body.appendChild(container);
            
            var opt = {
                margin: [10, 10, 10, 10],
                filename: 'CoachIQ_Scouting_Report_' + (currentReportData.opponent || 'Report').replace(/[^a-zA-Z0-9]/g, '_') + '.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };
            
            html2pdf().set(opt).from(container).save().then(function() {
                document.body.removeChild(container);
                showToast('PDF downloaded!');
            }).catch(function(err) {
                document.body.removeChild(container);
                showToast('PDF generation failed', 'error');
                console.error('PDF error:', err);
            });
        }
        
        function generatePDFContent(report) {
            var teamInfo = report.teamInfo || {};
            var opponentColor = teamInfo.opponent?.jerseyColor || '';
            var yourColor = teamInfo.yourTeam?.jerseyColor || '';
            
            var html = '<div style="font-family: Arial, sans-serif; color: #333; padding: 20px; background: #fff;">';
            
            // Header
            html += '<div style="background: linear-gradient(135deg, #FF6B35, #FF8E53); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 24px;">';
            html += '<h1 style="margin: 0; font-size: 28px; letter-spacing: 2px;">COACHIQ SCOUTING REPORT</h1>';
            html += '<h2 style="margin: 10px 0 0 0; font-size: 36px; font-weight: bold;">' + (report.opponent || 'OPPONENT').toUpperCase() + '</h2>';
            if (opponentColor) html += '<p style="margin: 8px 0 0 0; opacity: 0.9;">(' + opponentColor.toUpperCase() + ' Jerseys)</p>';
            html += '</div>';
            
            // Team identification
            if (opponentColor || yourColor) {
                html += '<div style="display: flex; gap: 20px; margin-bottom: 24px;">';
                html += '<div style="flex: 1; background: #FFF5F0; border-left: 4px solid #FF6B35; padding: 15px; border-radius: 8px;">';
                html += '<p style="font-size: 12px; color: #888; margin: 0;">🎯 SCOUTED TEAM</p>';
                html += '<p style="font-weight: bold; margin: 5px 0 0 0;">' + (teamInfo.opponent?.name || report.opponent) + ' (' + (opponentColor || 'unknown').toUpperCase() + ')</p>';
                html += '</div>';
                html += '<div style="flex: 1; background: #F0FFF9; border-left: 4px solid #00D4AA; padding: 15px; border-radius: 8px;">';
                html += '<p style="font-size: 12px; color: #888; margin: 0;">🏠 YOUR TEAM</p>';
                html += '<p style="font-weight: bold; margin: 5px 0 0 0;">' + (teamInfo.yourTeam?.name || 'Your Team') + ' (' + (yourColor || 'unknown').toUpperCase() + ')</p>';
                html += '</div>';
                html += '</div>';
            }
            
            // Key Stats Grid
            html += '<div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">';
            html += '<h3 style="margin: 0 0 16px 0; color: #FF6B35;">📊 OPPONENT STATISTICS</h3>';
            html += '<table style="width: 100%; border-collapse: collapse;">';
            html += '<tr>';
            html += '<td style="padding: 12px; background: white; border-radius: 8px; text-align: center; width: 25%;"><div style="font-size: 11px; color: #888;">Their Defense</div><div style="font-size: 20px; font-weight: bold; color: #FF6B35;">' + (report.defense?.primary?.scheme || report.defense?.primary || '--') + '</div></td>';
            html += '<td style="padding: 12px; background: white; border-radius: 8px; text-align: center; width: 25%;"><div style="font-size: 11px; color: #888;">Their Pace</div><div style="font-size: 20px; font-weight: bold; color: #00D4AA;">' + (report.paceAnalysis?.paceRating || report.pace?.rating || '--') + '</div></td>';
            html += '<td style="padding: 12px; background: white; border-radius: 8px; text-align: center; width: 25%;"><div style="font-size: 11px; color: #888;">Poss/Game</div><div style="font-size: 20px; font-weight: bold;">' + (report.paceAnalysis?.estimatedPossessionsPerGame || '--') + '</div></td>';
            html += '<td style="padding: 12px; background: white; border-radius: 8px; text-align: center; width: 25%;"><div style="font-size: 11px; color: #888;">Confidence</div><div style="font-size: 20px; font-weight: bold; color: #00D4AA;">' + (report.confidence || '--') + '%</div></td>';
            html += '</tr>';
            html += '</table>';
            html += '</div>';
            
            // Must Stop Box
            if (report.teamValueIdentification?.mostValuableAspect) {
                html += '<div style="background: linear-gradient(135deg, #FF6B35, #FF8E53); color: white; padding: 20px; border-radius: 12px; margin-bottom: 24px;">';
                html += '<h3 style="margin: 0 0 8px 0;">🎯 OPPONENT\'S #1 WEAPON — MUST STOP TO WIN</h3>';
                html += '<p style="margin: 0; font-size: 18px;">' + report.teamValueIdentification.mostValuableAspect + '</p>';
                html += '</div>';
            }
            
            // Defense Section
            html += '<div style="margin-bottom: 24px; page-break-inside: avoid;">';
            html += '<h3 style="color: #FF6B35; border-bottom: 2px solid #FF6B35; padding-bottom: 8px;">🛡️ OPPONENT\'S DEFENSE</h3>';
            if (report.defense?.primary?.details) html += '<p style="color: #666;">' + report.defense.primary.details + '</p>';
            if (report.defense?.breakdown) {
                html += '<table style="width: 100%; border-collapse: collapse; margin-top: 12px;">';
                report.defense.breakdown.forEach(function(d) {
                    html += '<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">' + d.name + '</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #FF6B35;">' + d.percentage + '%</td></tr>';
                });
                html += '</table>';
            }
            if (report.defense?.weaknesses?.length > 0) {
                html += '<p style="margin-top: 16px; font-weight: bold; color: #FF6B35;">Weaknesses to exploit:</p>';
                report.defense.weaknesses.forEach(function(w) {
                    html += '<p style="color: #666; margin: 4px 0;">• ' + (typeof w === 'string' ? w : w.weakness) + '</p>';
                });
            }
            html += '</div>';
            
            // Offense Section
            html += '<div style="margin-bottom: 24px; page-break-inside: avoid;">';
            html += '<h3 style="color: #FF6B35; border-bottom: 2px solid #FF6B35; padding-bottom: 8px;">⚡ OPPONENT\'S OFFENSE</h3>';
            if (report.offense?.primary?.details) html += '<p style="color: #666;">' + report.offense.primary.details + '</p>';
            if (report.offense?.setsAndActions?.length > 0) {
                html += '<table style="width: 100%; border-collapse: collapse; margin-top: 12px;">';
                report.offense.setsAndActions.forEach(function(s) {
                    html += '<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">' + s.name + '</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #00D4AA;">' + s.frequency + '%</td></tr>';
                });
                html += '</table>';
            }
            html += '</div>';
            
            // Key Players
            if (report.keyPlayers?.length > 0) {
                html += '<div style="margin-bottom: 24px; page-break-inside: avoid;">';
                html += '<h3 style="color: #FF6B35; border-bottom: 2px solid #FF6B35; padding-bottom: 8px;">👤 OPPONENT\'S KEY PLAYERS</h3>';
                report.keyPlayers.forEach(function(p) {
                    html += '<div style="background: #f9f9f9; padding: 12px; border-radius: 8px; margin-bottom: 8px;">';
                    html += '<strong>' + (p.number || p.jersey || '') + ' ' + (p.position || '') + '</strong>';
                    if (p.role) html += ' — ' + p.role;
                    if (p.tendencies) html += '<p style="color: #666; margin: 4px 0 0 0; font-size: 13px;">' + p.tendencies + '</p>';
                    html += '</div>';
                });
                html += '</div>';
            }
            
            // Recommendations
            if (report.recommendations) {
                html += '<div style="margin-bottom: 24px; page-break-inside: avoid;">';
                html += '<h3 style="color: #00D4AA; border-bottom: 2px solid #00D4AA; padding-bottom: 8px;">💡 YOUR GAME PLAN</h3>';
                if (report.recommendations.offensive?.length > 0) {
                    html += '<p style="font-weight: bold; margin-top: 12px;">Offensive Keys:</p>';
                    report.recommendations.offensive.forEach(function(r) {
                        html += '<p style="color: #666; margin: 4px 0;">✓ ' + (typeof r === 'string' ? r : r.recommendation || r.key) + '</p>';
                    });
                }
                if (report.recommendations.defensive?.length > 0) {
                    html += '<p style="font-weight: bold; margin-top: 12px;">Defensive Keys:</p>';
                    report.recommendations.defensive.forEach(function(r) {
                        html += '<p style="color: #666; margin: 4px 0;">✓ ' + (typeof r === 'string' ? r : r.recommendation || r.key) + '</p>';
                    });
                }
                html += '</div>';
            }
            
            // Practice Plan
            if (report.recommendations?.practiceEmphasis?.length > 0) {
                html += '<div style="margin-bottom: 24px; page-break-inside: avoid;">';
                html += '<h3 style="color: #00D4AA; border-bottom: 2px solid #00D4AA; padding-bottom: 8px;">📋 YOUR PRACTICE PLAN</h3>';
                report.recommendations.practiceEmphasis.forEach(function(drill) {
                    html += '<div style="background: #f9f9f9; padding: 12px; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #00D4AA;">';
                    html += '<strong>' + (drill.drill || drill.name || 'Drill') + '</strong>';
                    if (drill.duration) html += ' <span style="color: #888;">(' + drill.duration + ')</span>';
                    if (drill.purpose) html += '<p style="color: #666; margin: 4px 0 0 0; font-size: 13px;">' + drill.purpose + '</p>';
                    html += '</div>';
                });
                html += '</div>';
            }
            
            // Footer
            html += '<div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px;">';
            html += '<p>Generated by CoachIQ AI Video Analysis • ' + new Date().toLocaleDateString() + '</p>';
            html += '<p>Frames Analyzed: ' + (report.framesAnalyzed || '--') + ' • AI Confidence: ' + (report.confidence || '--') + '%</p>';
            html += '<p style="margin-top: 8px;"><strong>meetyournewstatscoach.com</strong></p>';
            html += '</div>';
            
            html += '</div>';
            return html;
        }
        
        function printReport() {
            if (!currentReportData) {
                showToast('No report loaded', 'error');
                return;
            }
            
            var printContent = generatePDFContent(currentReportData);
            var printWindow = window.open('', '_blank');
            printWindow.document.write('<html><head><title>CoachIQ Scouting Report - ' + currentReportData.opponent + '</title></head><body>');
            printWindow.document.write(printContent);
            printWindow.document.write('\n\n</body></html>');
            printWindow.document.close();
            printWindow.print();
        }
        
        function copyReportLink() {
            if (viewingReportId) {
                var link = window.location.origin + '/reports/' + viewingReportId;
                navigator.clipboard.writeText(link).then(function() {
                    showToast('Link copied!');
                }).catch(function() {
                    showToast('Could not copy link', 'error');
                });
            } else {
                showToast('No report to share', 'error');
            }
        }

        function showToast(msg, type) {
            var t = document.createElement('div');
            t.className = 'toast ' + (type || 'success');
            t.innerHTML = '<span>' + msg + '</span>';
            document.getElementById('toast-container').appendChild(t);
            setTimeout(function() { t.remove(); }, 4000);
        }

        function showSection(s) {
            // Clear polling when navigating away
            if (reportPollInterval) { clearInterval(reportPollInterval); reportPollInterval = null; }
            isPolling = false;
            pollRetryCount = 0;
            
            document.querySelectorAll('[id$="-section"]').forEach(function(el) { el.classList.add('section-hidden'); });
            var t = document.getElementById(s + '-section');
            if (t) t.classList.remove('section-hidden');
            if (s === 'analyze' && !backgroundUpload.active) resetAnalyze();
            if (s === 'dashboard') loadDashboard();
            document.getElementById('user-dropdown').classList.remove('active');
            window.scrollTo(0, 0);
        }

        function resetAnalyze() {
            document.getElementById('step-upload').style.display = 'block';
            document.getElementById('step-details').style.display = 'none';
            document.getElementById('step-success').style.display = 'none';
            document.getElementById('continue-btn').disabled = true;
            clearVideo();
            if (currentUser) {
                document.getElementById('user-email').value = currentUser.email || '';
                document.getElementById('user-name').value = currentUser.name || '';
            }
        }

        function openAuthModal(mode) {
            authMode = mode || 'signup';
            switchAuthTab(authMode);
            document.getElementById('auth-modal').classList.add('active');
        }
        function closeAuthModal() { document.getElementById('auth-modal').classList.remove('active'); }
        function switchAuthTab(mode) {
            authMode = mode;
            document.getElementById('tab-login').classList.toggle('active', mode === 'login');
            document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
            document.getElementById('name-group').style.display = mode === 'signup' ? 'block' : 'none';
            document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
        }

        function handleAuth(e) {
            e.preventDefault();
            currentUser = { email: document.getElementById('auth-email').value, name: document.getElementById('auth-name').value || 'Coach', subscription: 'free' };
            localStorage.setItem('coachiq_user', JSON.stringify(currentUser));
            updateUserUI();
            closeAuthModal();
            showToast(authMode === 'login' ? 'Welcome back!' : 'Account created!');
            showSection('analyze');
        }

        function updateUserUI() {
            if (currentUser) {
                document.getElementById('auth-buttons').style.display = 'none';
                document.getElementById('user-section').style.display = 'block';
                document.getElementById('nav-dashboard').style.display = 'inline';
                document.getElementById('user-initial').textContent = (currentUser.email || 'C')[0].toUpperCase();
                document.getElementById('user-dropdown-name').textContent = currentUser.name || 'Coach';
                document.getElementById('user-dropdown-email').textContent = currentUser.email || '';
                var badge = document.getElementById('user-plan-badge');
                badge.textContent = currentUser.subscription === 'pro' ? 'PRO' : 'FREE TRIAL';
                badge.className = 'plan-badge ' + (currentUser.subscription === 'pro' ? 'pro' : 'free');
            } else {
                document.getElementById('auth-buttons').style.display = 'flex';
                document.getElementById('user-section').style.display = 'none';
                document.getElementById('nav-dashboard').style.display = 'none';
            }
        }

        function logout() {
            currentUser = null;
            localStorage.removeItem('coachiq_user');
            updateUserUI();
            document.getElementById('user-dropdown').classList.remove('active');
            showSection('home');
            showToast('Signed out');
        }

        function toggleUserMenu() { document.getElementById('user-dropdown').classList.toggle('active'); }

        function subscribe(plan) {
            if (!currentUser) { openAuthModal('signup'); return; }
            showToast('Redirecting to checkout...');
        }

        function showUploadBanner() { document.getElementById('upload-banner').classList.add('active'); document.body.classList.add('uploading'); }
        function hideUploadBanner() { document.getElementById('upload-banner').classList.remove('active'); document.body.classList.remove('uploading'); }
        function minimizeBanner() { document.getElementById('upload-banner').classList.remove('active'); }
        function updateUploadProgress(pct, speed) {
            document.getElementById('banner-progress-fill').style.width = pct + '%';
            document.getElementById('banner-percent').textContent = pct + '%';
            document.getElementById('banner-speed').textContent = speed;
        }
        function showUploadComplete(name) {
            document.getElementById('banner-title').textContent = 'Upload complete: ' + name;
            document.getElementById('banner-subtitle').textContent = 'Analysis started';
            document.getElementById('banner-progress-fill').style.width = '100%';
            setTimeout(function() { hideUploadBanner(); backgroundUpload.active = false; }, 5000);
        }

        function handleVideoFile(file) {
            if (backgroundUpload.active) { showToast('Upload in progress', 'error'); return; }
            if (!file.type.startsWith('video/')) { showToast('Select a video file', 'error'); return; }
            var sizeMB = file.size / (1024 * 1024);
            currentVideo = { file: file, name: file.name, size: sizeMB >= 1024 ? (sizeMB / 1024).toFixed(2) + ' GB' : sizeMB.toFixed(1) + ' MB' };
            document.getElementById('preview-video').src = URL.createObjectURL(file);
            document.getElementById('video-name').textContent = file.name;
            document.getElementById('video-size').textContent = ' · ' + currentVideo.size;
            document.getElementById('video-preview').style.display = 'block';
            document.getElementById('upload-zone').style.display = 'none';
            document.getElementById('continue-btn').disabled = false;
        }

        function clearVideo() {
            currentVideo = null;
            document.getElementById('preview-video').src = '';
            document.getElementById('video-preview').style.display = 'none';
            document.getElementById('upload-zone').style.display = 'block';
            document.getElementById('file-input').value = '';
            document.getElementById('continue-btn').disabled = true;
        }

        function goToStep2() { if (!currentVideo) return; document.getElementById('step-upload').style.display = 'none'; document.getElementById('step-details').style.display = 'block'; }
        function goToStep1() { document.getElementById('step-details').style.display = 'none'; document.getElementById('step-upload').style.display = 'block'; }

        async function startBackgroundUpload() {
            var opponentName = document.getElementById('opponent-name').value.trim();
            var yourTeamName = document.getElementById('your-team-name').value.trim();
            var userEmail = document.getElementById('user-email').value.trim();
            var userName = document.getElementById('user-name').value.trim();
            
            // Get team colors
            var opponentColor = document.getElementById('opponent-color').value;
            var opponentColorCustom = document.getElementById('opponent-color-custom').value.trim();
            var yourColor = document.getElementById('your-color').value;
            var yourColorCustom = document.getElementById('your-color-custom').value.trim();
            
            // Use custom color if provided, otherwise use dropdown
            var finalOpponentColor = opponentColorCustom || opponentColor || 'unknown';
            var finalYourColor = yourColorCustom || yourColor || 'unknown';
            
            if (!opponentName) { showToast('Enter opponent name', 'error'); return; }
            if (!userEmail) { showToast('Enter your email', 'error'); return; }
            if (!currentVideo) return;
            
            // Warn if colors not specified
            if (finalOpponentColor === 'unknown' || finalYourColor === 'unknown') {
                if (!confirm('Team colors not fully specified. Analysis may not clearly distinguish between teams. Continue anyway?')) {
                    return;
                }
            }
            
            var options = []; document.querySelectorAll('.option.selected').forEach(function(el) { options.push(el.dataset.option); });
            
            // Build team info object
            var teamInfo = {
                opponent: {
                    name: opponentName,
                    jerseyColor: finalOpponentColor
                },
                yourTeam: {
                    name: yourTeamName || 'Your Team',
                    jerseyColor: finalYourColor
                }
            };
            
            currentUser = { email: userEmail, name: userName || 'Coach', subscription: currentUser?.subscription || 'free' };
            localStorage.setItem('coachiq_user', JSON.stringify(currentUser));
            updateUserUI();
            document.getElementById('step-details').style.display = 'none';
            document.getElementById('step-success').style.display = 'block';
            document.getElementById('confirm-email').textContent = userEmail;
            backgroundUpload.active = true;
            showUploadBanner();
            updateUploadProgress(0, 'Starting...');
            showToast('Upload started!');
            try {
                var file = currentVideo.file, sizeMB = file.size / (1024 * 1024);
                if (sizeMB > 100) await uploadChunked(file, opponentName, options, userEmail, userName, teamInfo);
                else await uploadSimple(file, opponentName, options, userEmail, userName, teamInfo);
                showUploadComplete(opponentName);
                showToast('Upload complete!');
            } catch (e) { hideUploadBanner(); backgroundUpload.active = false; showToast('Upload failed', 'error'); }
        }

        async function uploadSimple(file, opponentName, options, userEmail, userName, teamInfo) {
            var formData = new FormData();
            formData.append('video', file);
            formData.append('opponentName', opponentName);
            formData.append('analysisOptions', JSON.stringify(options));
            formData.append('userEmail', userEmail);
            formData.append('userName', userName);
            formData.append('teamInfo', JSON.stringify(teamInfo));
            return new Promise(function(resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', CONFIG.API_URL + '/api/upload/simple');
                xhr.upload.onprogress = function(e) { if (e.lengthComputable) updateUploadProgress(Math.round((e.loaded / e.total) * 100), (e.loaded / 1024 / 1024).toFixed(1) + ' MB'); };
                xhr.onload = function() { xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(); };
                xhr.onerror = reject;
                xhr.send(formData);
            });
        }

        async function uploadChunked(file, opponentName, options, userEmail, userName, teamInfo) {
            var totalChunks = Math.ceil(file.size / CONFIG.CHUNK_SIZE);
            var initRes = await fetch(CONFIG.API_URL + '/api/upload/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, fileSize: file.size, totalChunks: totalChunks, userEmail: userEmail }) });
            var uploadId = (await initRes.json()).uploadId, startTime = Date.now(), uploaded = 0;
            for (var i = 0; i < totalChunks; i++) {
                var start = i * CONFIG.CHUNK_SIZE, end = Math.min(start + CONFIG.CHUNK_SIZE, file.size);
                var formData = new FormData(); formData.append('chunk', file.slice(start, end)); formData.append('uploadId', uploadId); formData.append('chunkIndex', String(i).padStart(6, '0'));
                await fetch(CONFIG.API_URL + '/api/upload/chunk', { method: 'POST', body: formData });
                uploaded += (end - start);
                updateUploadProgress(Math.round((uploaded / file.size) * 100), (uploaded / ((Date.now() - startTime) / 1000) / 1024 / 1024).toFixed(1) + ' MB/s');
            }
            await fetch(CONFIG.API_URL + '/api/upload/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId: uploadId, opponentName: opponentName, analysisOptions: options, userEmail: userEmail, userName: userName, teamInfo: teamInfo }) });
        }

        async function loadDashboard() {
            if (!currentUser) { openAuthModal('login'); return; }
            document.getElementById('dashboard-loading').style.display = 'block';
            document.getElementById('dashboard-empty').style.display = 'none';
            document.getElementById('dashboard-reports').style.display = 'none';
            try {
                var res = await fetch(CONFIG.API_URL + '/api/users/' + encodeURIComponent(currentUser.email) + '/reports');
                var data = await res.json();
                document.getElementById('dashboard-loading').style.display = 'none';
                if (!data.reports || data.reports.length === 0) { document.getElementById('dashboard-empty').style.display = 'block'; return; }
                var html = '';
                data.reports.forEach(function(r) {
                    var statusClass = 'status-' + r.status;
                    var statusText = r.status === 'complete' ? 'Ready' : r.status === 'processing' ? 'Processing ' + (r.progress || 0) + '%' : r.status === 'queued' ? 'Queued' : 'Failed';
                    html += '<div class="report-card" onclick="viewReport(\'' + r.id + '\')"><div><h4>' + r.opponentName + '</h4><p>' + new Date(r.createdAt).toLocaleDateString() + '</p></div><span class="status-badge ' + statusClass + '">' + statusText + '</span></div>';
                });
                document.getElementById('dashboard-reports').innerHTML = html;
                document.getElementById('dashboard-reports').style.display = 'flex';
            } catch (e) { document.getElementById('dashboard-loading').style.display = 'none'; document.getElementById('dashboard-empty').style.display = 'block'; }
        }

        async function viewReport(reportId) {
            viewingReportId = reportId;
            
            // Clear any existing poll and reset state
            if (reportPollInterval) { clearInterval(reportPollInterval); reportPollInterval = null; }
            isPolling = false;
            pollRetryCount = 0;
            
            showSection('report');
            document.getElementById('report-loading').style.display = 'block';
            document.getElementById('report-processing').style.display = 'none';
            document.getElementById('report-content').style.display = 'none';
            document.getElementById('report-error').style.display = 'none';
            await loadReport(reportId);
        }

        async function loadReport(reportId) {
            // Prevent overlapping requests
            if (isPolling) return;
            isPolling = true;
            
            try {
                var res = await fetch(CONFIG.API_URL + '/api/reports/' + reportId);
                
                if (!res.ok) {
                    throw new Error('Server returned ' + res.status);
                }
                
                var data = await res.json();
                document.getElementById('report-loading').style.display = 'none';
                document.getElementById('view-report-title').textContent = '📋 ' + (data.opponentName || 'Report');
                
                if (data.status === 'complete' && data.report) {
                    // Stop polling - report is ready
                    if (reportPollInterval) { clearInterval(reportPollInterval); reportPollInterval = null; }
                    pollRetryCount = 0;
                    displayReportContent(data.report);
                } else if (data.status === 'failed') {
                    // Stop polling - report failed
                    if (reportPollInterval) { clearInterval(reportPollInterval); reportPollInterval = null; }
                    pollRetryCount = 0;
                    document.getElementById('report-error').style.display = 'block';
                    document.getElementById('report-error-message').textContent = data.error || 'Analysis failed';
                } else {
                    // Still processing - show progress and continue polling
                    document.getElementById('report-processing').style.display = 'block';
                    document.getElementById('report-processing-text').textContent = data.progressText || 'Processing...';
                    document.getElementById('report-progress-fill').style.width = (data.progress || 0) + '%';
                    
                    pollRetryCount++;
                    if (pollRetryCount >= MAX_POLL_RETRIES) {
                        // Stop after max retries
                        if (reportPollInterval) { clearInterval(reportPollInterval); reportPollInterval = null; }
                        document.getElementById('report-processing-text').textContent = 'Still processing. Refresh page to check status.';
                    } else if (!reportPollInterval) {
                        // Start polling if not already polling (5 second interval)
                        reportPollInterval = setInterval(function() { loadReport(reportId); }, 5000);
                    }
                }
            } catch (e) {
                console.error('Error loading report:', e);
                pollRetryCount++;
                
                if (pollRetryCount >= MAX_POLL_RETRIES) {
                    if (reportPollInterval) { clearInterval(reportPollInterval); reportPollInterval = null; }
                    document.getElementById('report-loading').style.display = 'none';
                    document.getElementById('report-error').style.display = 'block';
                    document.getElementById('report-error-message').textContent = 'Failed to load report. Please try again later.';
                }
                // Otherwise let the interval retry
            } finally {
                isPolling = false;
            }
        }

        function displayReportContent(report) {
            // Store report data for PDF export
            currentReportData = report;
            
            // Stop any polling
            if (reportPollInterval) { clearInterval(reportPollInterval); reportPollInterval = null; }
            isPolling = false;
            pollRetryCount = 0;
            
            document.getElementById('report-processing').style.display = 'none';
            document.getElementById('report-content').style.display = 'block';
            document.getElementById('report-date').textContent = 'Generated ' + new Date(report.generatedAt).toLocaleDateString();
            
            // Opponent Banner
            document.getElementById('opponent-banner-name').textContent = (report.opponent || 'OPPONENT').toUpperCase();
            
            // Team Info Banner
            var teamInfo = report.teamInfo;
            if (teamInfo && (teamInfo.opponent?.jerseyColor || teamInfo.yourTeam?.jerseyColor)) {
                document.getElementById('team-info-banner').style.display = 'block';
                document.getElementById('team-opponent-name').textContent = (teamInfo.opponent?.name || report.opponent) + ' (' + (teamInfo.opponent?.jerseyColor || 'unknown').toUpperCase() + ' jerseys)';
                document.getElementById('team-your-name').textContent = (teamInfo.yourTeam?.name || 'Your Team') + ' (' + (teamInfo.yourTeam?.jerseyColor || 'unknown').toUpperCase() + ' jerseys)';
                document.getElementById('opponent-banner-color').textContent = '(' + (teamInfo.opponent?.jerseyColor || '').toUpperCase() + ' jerseys)';
                
                // Set color swatches
                var colorMap = {
                    'dark': '#1a1a1a', 'black': '#1a1a1a', 'white': '#ffffff', 'red': '#dc2626',
                    'blue': '#2563eb', 'navy': '#1e3a8a', 'light-blue': '#38bdf8', 'green': '#16a34a',
                    'dark-green': '#15803d', 'yellow': '#eab308', 'orange': '#ea580c', 'purple': '#9333ea',
                    'maroon': '#7f1d1d', 'gray': '#6b7280', 'grey': '#6b7280', 'pink': '#ec4899'
                };
                var oppColor = colorMap[teamInfo.opponent?.jerseyColor?.toLowerCase()] || '#888';
                var yourColor = colorMap[teamInfo.yourTeam?.jerseyColor?.toLowerCase()] || '#888';
                document.getElementById('team-opponent-color').style.background = oppColor;
                document.getElementById('team-opponent-color').style.border = oppColor === '#ffffff' ? '2px solid #ccc' : 'none';
                document.getElementById('team-your-color').style.background = yourColor;
                document.getElementById('team-your-color').style.border = yourColor === '#ffffff' ? '2px solid #ccc' : 'none';
            } else {
                document.getElementById('team-info-banner').style.display = 'none';
                document.getElementById('opponent-banner-color').textContent = '';
            }
            
            // Top Stats (all OPPONENT stats)
            document.getElementById('stat-defense').textContent = report.defense?.primary?.scheme || report.defense?.primary || '--';
            document.getElementById('stat-pace').textContent = report.paceAnalysis?.paceRating || report.paceAndTempo?.paceRating || report.pace?.rating || '--';
            document.getElementById('stat-possessions').textContent = report.paceAnalysis?.estimatedPossessionsPerGame || report.paceAndTempo?.possessionsPerGameEstimate || '--';
            document.getElementById('stat-reversals').textContent = report.ballMovementMetrics?.reversalsPerPossession || report.ballMovementAnalytics?.reversalsPerPossession || '--';
            document.getElementById('stat-passes').textContent = report.ballMovementMetrics?.passesPerPossession || report.ballMovementAnalytics?.passesBeforeShot || '--';
            var toConv = report.turnoverToScoreAnalysis?.turnoverConversionRate || report.turnoverAnalysis?.turnoverConversion?.conversionRate;
            document.getElementById('stat-toconversion').textContent = toConv ? toConv + '%' : '--';
            document.getElementById('stat-frames').textContent = report.framesAnalyzed || '--';
            document.getElementById('stat-confidence').textContent = (report.confidence || '--') + '%';

            // Must Stop Box
            var tv = report.teamValueIdentification;
            if (tv?.mostValuableAspect) {
                document.getElementById('must-stop-box').style.display = 'block';
                document.getElementById('must-stop-text').textContent = tv.mostValuableAspect;
            } else {
                document.getElementById('must-stop-box').style.display = 'none';
            }

            // Defense Section
            var defHtml = '';
            if (report.defense?.primary?.details) defHtml += '<p style="margin-bottom: 16px; color: var(--text-muted);">' + report.defense.primary.details + '</p>';
            if (report.defense?.breakdown) report.defense.breakdown.forEach(function(d) { defHtml += '<div class="report-item"><span>' + d.name + '</span><span class="report-item-value">' + d.percentage + '%</span></div>'; });
            if (report.defense?.weaknesses?.length > 0) {
                defHtml += '<p style="margin-top: 16px; font-weight: 700; color: var(--orange);">Weaknesses to exploit:</p>';
                report.defense.weaknesses.forEach(function(w) { defHtml += '<p style="color: var(--text-muted); padding: 8px 0;">• ' + (typeof w === 'string' ? w : w.weakness + (w.howToExploit ? ' — ' + w.howToExploit : '')) + '</p>'; });
            }
            document.getElementById('defense-breakdown').innerHTML = defHtml || '<p style="color: var(--text-muted);">No data</p>';

            // Offense Section
            var offHtml = '';
            if (report.offense?.primary?.details) offHtml += '<p style="margin-bottom: 16px; color: var(--text-muted);">' + report.offense.primary.details + '</p>';
            if (report.offense?.setsAndActions?.length > 0) report.offense.setsAndActions.forEach(function(s) { offHtml += '<div class="report-item"><span>' + s.name + '</span><span class="report-item-value">' + s.frequency + '%</span></div>'; });
            else if (report.offense?.topPlays) report.offense.topPlays.forEach(function(p) { offHtml += '<div class="report-item"><span>' + p.name + '</span><span class="report-item-value">' + p.percentage + '%</span></div>'; });
            document.getElementById('offense-breakdown').innerHTML = offHtml || '<p style="color: var(--text-muted);">No data</p>';

            // Set Efficiency & Ball Movement
            var effHtml = '';
            var setData = report.offensiveSetTracking?.setBySetBreakdown || report.offensiveSetEfficiency?.setBreakdown || [];
            if (setData.length > 0) {
                effHtml += '<p style="font-weight: 700; margin-bottom: 16px; color: var(--orange);">📊 SET-BY-SET BREAKDOWN</p>';
                setData.forEach(function(s) {
                    effHtml += '<div class="breakdown-card">';
                    effHtml += '<div class="breakdown-card-header"><span class="breakdown-card-title">' + (s.setName || s.name) + '</span><span class="breakdown-card-value">' + (s.pointsPerPossession || s.ppp || '--') + ' PPP</span></div>';
                    effHtml += '<div style="display: flex; gap: 16px; font-size: 0.85rem; color: var(--text-muted);">';
                    effHtml += '<span>Run ' + (s.timesRun || '--') + 'x</span>';
                    effHtml += '<span>' + (s.pointsScored || '--') + ' pts</span>';
                    if (s.percentageOfPossessions) effHtml += '<span>' + s.percentageOfPossessions + '% of poss</span>';
                    effHtml += '</div>';
                    if (s.primaryBeneficiary) effHtml += '<p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">Primary: ' + s.primaryBeneficiary + '</p>';
                    if (s.bestDefense) effHtml += '<p style="font-size: 0.85rem; color: var(--accent); margin-top: 4px;">🛡️ Counter: ' + s.bestDefense + '</p>';
                    effHtml += '</div>';
                });
            }
            var bm = report.ballMovementMetrics || report.ballMovementAnalytics;
            if (bm) {
                effHtml += '<p style="font-weight: 700; margin-top: 24px; margin-bottom: 16px; color: var(--accent);">🏀 BALL MOVEMENT</p>';
                if (bm.totalBallReversals) effHtml += '<div class="report-item"><span>Total ball reversals</span><span class="report-item-value">' + bm.totalBallReversals + '</span></div>';
                if (bm.reversalsPerPossession) effHtml += '<div class="report-item"><span>Reversals per possession</span><span class="report-item-value">' + bm.reversalsPerPossession + '</span></div>';
                if (bm.passesPerPossession) effHtml += '<div class="report-item"><span>Passes before shot</span><span class="report-item-value">' + bm.passesPerPossession + '</span></div>';
                if (bm.reversalImpact) effHtml += '<p style="color: var(--warning); margin-top: 12px;">💡 ' + bm.reversalImpact + '</p>';
            }
            document.getElementById('efficiency-breakdown').innerHTML = effHtml || '<p style="color: var(--text-muted);">No data</p>';

            // Pace & Turnovers
            var paceHtml = '';
            var pa = report.paceAnalysis || report.paceAndTempo;
            if (pa) {
                paceHtml += '<p style="font-weight: 700; margin-bottom: 16px; color: var(--orange);">⏱️ PACE & TEMPO</p>';
                if (pa.possessionsObserved) paceHtml += '<div class="report-item"><span>Possessions observed</span><span class="report-item-value">' + pa.possessionsObserved + '</span></div>';
                if (pa.estimatedPossessionsPerGame || pa.possessionsPerGameEstimate) paceHtml += '<div class="report-item"><span>Est. possessions/game</span><span class="report-item-value">' + (pa.estimatedPossessionsPerGame || pa.possessionsPerGameEstimate) + '</span></div>';
                if (pa.paceCategory) paceHtml += '<div class="report-item"><span>Pace category</span><span class="report-item-value">' + pa.paceCategory.toUpperCase() + '</span></div>';
                if (pa.averagePossessionLength) paceHtml += '<div class="report-item"><span>Avg possession length</span><span class="report-item-value">' + pa.averagePossessionLength + '</span></div>';
            }
            var ta = report.turnoverToScoreAnalysis || report.turnoverAnalysis;
            if (ta) {
                paceHtml += '<p style="font-weight: 700; margin-top: 24px; margin-bottom: 16px; color: var(--error);">🔄 TURNOVER ANALYSIS</p>';
                if (ta.turnoversConvertedToScores != null) paceHtml += '<div class="report-item"><span>Turnovers → scores</span><span class="report-item-value">' + ta.turnoversConvertedToScores + '/' + ta.opponentTurnoversObserved + '</span></div>';
                if (ta.turnoverConversionRate) paceHtml += '<div class="report-item"><span>Conversion rate</span><span class="report-item-value">' + ta.turnoverConversionRate + '%</span></div>';
                if (ta.keyInsight) paceHtml += '<p style="color: var(--warning); margin-top: 12px; font-weight: 600;">🎯 ' + ta.keyInsight + '</p>';
            }
            document.getElementById('pace-breakdown').innerHTML = paceHtml || '<p style="color: var(--text-muted);">No data</p>';

            // Team Value Section
            var valueHtml = '';
            if (tv) {
                if (tv.offensiveIdentity?.whatMakesThemDangerous) {
                    valueHtml += '<div class="breakdown-card"><div class="breakdown-card-header"><span class="breakdown-card-title">⚡ Offensive Identity</span></div>';
                    valueHtml += '<p style="color: var(--text-muted);">' + tv.offensiveIdentity.whatMakesThemDangerous + '</p></div>';
                }
                if (tv.goToPlays?.needABucket) {
                    valueHtml += '<p style="font-weight: 700; margin-top: 16px; margin-bottom: 12px; color: var(--orange);">🏀 GO-TO PLAYS</p>';
                    valueHtml += '<div class="report-item"><span>Need a bucket</span><span style="color: var(--text-muted); font-size: 0.85rem;">' + tv.goToPlays.needABucket + '</span></div>';
                    if (tv.goToPlays.lastShot) valueHtml += '<div class="report-item"><span>Last shot</span><span style="color: var(--text-muted); font-size: 0.85rem;">' + tv.goToPlays.lastShot + '</span></div>';
                }
                if (tv.xFactor?.description) {
                    valueHtml += '<div style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); padding: 16px; border-radius: 10px; margin-top: 16px;">';
                    valueHtml += '<p style="font-weight: 700; color: #A78BFA; margin-bottom: 8px;">⭐ X-FACTOR</p>';
                    valueHtml += '<p style="color: var(--text-muted);">' + tv.xFactor.description + '</p></div>';
                }
            }
            document.getElementById('value-breakdown').innerHTML = valueHtml || '<p style="color: var(--text-muted);">No data</p>';

            // Players Section
            var playerHtml = '';
            var playerData = report.playerSetAssignments || report.playerSpecificSets || [];
            if (playerData.length > 0) {
                playerData.forEach(function(ps) {
                    playerHtml += '<div class="breakdown-card">';
                    playerHtml += '<div class="breakdown-card-header"><span class="breakdown-card-title">👤 ' + ps.player + '</span></div>';
                    if (ps.totalTouches) playerHtml += '<p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">' + ps.totalTouches + '</p>';
                    if (ps.mostEffectiveAction) playerHtml += '<p style="font-size: 0.85rem; color: var(--accent);">✓ Best action: ' + ps.mostEffectiveAction + '</p>';
                    var sets = ps.setsRunForThisPlayer || ps.designedPlays || [];
                    sets.forEach(function(set) {
                        playerHtml += '<div class="report-item"><span>' + (set.set || set.setName) + '</span><span class="report-item-value">' + (set.ppp || set.effectiveness || '--') + '</span></div>';
                    });
                    playerHtml += '</div>';
                });
            } else if (report.keyPlayers?.length > 0) {
                report.keyPlayers.forEach(function(p) { playerHtml += '<div class="report-item"><span>' + p.identifier + ' (' + p.position + ')</span><span class="report-item-value">' + p.threatLevel + '</span></div>'; });
            }
            document.getElementById('players-breakdown').innerHTML = playerHtml || '<p style="color: var(--text-muted);">No data</p>';

            // Practice Plan Section
            var practiceHtml = '';
            var drills = report.recommendations?.practiceEmphasis || [];
            if (drills.length > 0) {
                drills.forEach(function(drill) {
                    practiceHtml += '<div class="practice-drill">';
                    practiceHtml += '<div class="practice-drill-header">';
                    practiceHtml += '<span class="practice-drill-name">' + drill.drill + '</span>';
                    if (drill.duration) practiceHtml += '<span class="practice-drill-duration">' + drill.duration + '</span>';
                    practiceHtml += '</div>';
                    if (drill.purpose) practiceHtml += '<p class="practice-drill-purpose">' + drill.purpose + '</p>';
                    if (drill.coachingPoints?.length > 0) {
                        practiceHtml += '<ul class="practice-drill-points">';
                        drill.coachingPoints.forEach(function(pt) { practiceHtml += '<li>• ' + pt + '</li>'; });
                        practiceHtml += '</ul>';
                    }
                    if (drill.scoutTeamLook) practiceHtml += '<div class="scout-team-look">🎭 Scout Team: ' + drill.scoutTeamLook + '</div>';
                    practiceHtml += '</div>';
                });
            }
            document.getElementById('practice-breakdown').innerHTML = practiceHtml || '<p style="color: var(--text-muted);">No practice plan data</p>';

            // Recommendations Section
            var recHtml = '';
            if (report.recommendations?.keysToVictory?.length > 0) {
                recHtml += '<p style="font-weight: 700; margin-bottom: 12px; color: var(--accent);">🔑 KEYS TO VICTORY</p>';
                report.recommendations.keysToVictory.forEach(function(k, i) { recHtml += '<p style="color: var(--text-muted); padding: 8px 0;">' + (i + 1) + '. ' + k + '</p>'; });
            }
            if (report.recommendations?.offensiveGamePlan?.primaryStrategy) {
                recHtml += '<p style="font-weight: 700; margin-top: 20px; margin-bottom: 8px; color: var(--orange);">⚡ OFFENSIVE STRATEGY</p>';
                recHtml += '<p style="color: var(--text-muted);">' + report.recommendations.offensiveGamePlan.primaryStrategy + '</p>';
            }
            if (report.recommendations?.defensiveGamePlan?.recommendedScheme) {
                recHtml += '<p style="font-weight: 700; margin-top: 20px; margin-bottom: 8px; color: var(--accent);">🛡️ DEFENSIVE STRATEGY</p>';
                recHtml += '<p style="color: var(--text-muted);">Recommended: ' + report.recommendations.defensiveGamePlan.recommendedScheme + '</p>';
            }
            document.getElementById('recommendations').innerHTML = recHtml || '<p style="color: var(--text-muted);">No recommendations</p>';
if (report.analysis.outOfBoundsPlays) {
}
			
        }

        window.onbeforeunload = function(e) { 
            // Clean up polling
            if (reportPollInterval) { clearInterval(reportPollInterval); reportPollInterval = null; }
            
            if (backgroundUpload.active) { 
                e.preventDefault(); 
                e.returnValue = 'Upload in progress'; 
                return e.returnValue; 
            } 
        };

        document.addEventListener('DOMContentLoaded', function() {
            var saved = localStorage.getItem('coachiq_user');
            if (saved) { currentUser = JSON.parse(saved); updateUserUI(); }
            var uploadZone = document.getElementById('upload-zone'), fileInput = document.getElementById('file-input');
            uploadZone.addEventListener('click', function() { fileInput.click(); });
            uploadZone.addEventListener('dragover', function(e) { e.preventDefault(); uploadZone.classList.add('dragover'); });
            uploadZone.addEventListener('dragleave', function() { uploadZone.classList.remove('dragover'); });
            uploadZone.addEventListener('drop', function(e) { e.preventDefault(); uploadZone.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleVideoFile(e.dataTransfer.files[0]); });
            fileInput.addEventListener('change', function(e) { if (e.target.files[0]) handleVideoFile(e.target.files[0]); });
        });
    </script>



</body>
</html>
