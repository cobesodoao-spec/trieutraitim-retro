<?php
/**
 * Triệu Trái Tim (.info) - Backend PHP cho Hostinger / cPanel / Shared Hosting
 * Hỗ trợ: Lưu Playlist & Cấu hình (site-db.json), Upload & Quản lý file MP3 (uploads/), Bảo mật Admin Session
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

session_start();

$rootDir    = __DIR__;
$dataDir    = $rootDir . DIRECTORY_SEPARATOR . 'data';
$uploadsDir = $rootDir . DIRECTORY_SEPARATOR . 'uploads';
$dbFile     = $rootDir . DIRECTORY_SEPARATOR . 'site-db.json';
$authFile   = $dataDir . DIRECTORY_SEPARATOR . 'admin-auth.php';

if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0755, true);
}
if (!is_dir($uploadsDir)) {
    @mkdir($uploadsDir, 0755, true);
}

// Bảo vệ thư mục data/ không cho truy cập trực tiếp từ trình duyệt
$dataHtaccess = $dataDir . DIRECTORY_SEPARATOR . '.htaccess';
if (!file_exists($dataHtaccess)) {
    @file_put_contents($dataHtaccess, "Order deny,allow\nDeny from all\n");
}

// Bảo vệ thư mục uploads/ không cho thực thi mã PHP độc hại
$uploadsHtaccess = $uploadsDir . DIRECTORY_SEPARATOR . '.htaccess';
if (!file_exists($uploadsHtaccess)) {
    $safeUploadsRules = "<FilesMatch \"\\.(php|php5|php7|php8|phtml|phar|pl|py|cgi|sh)$\">\n  Order deny,allow\n  Deny from all\n</FilesMatch>\n";
    @file_put_contents($uploadsHtaccess, $safeUploadsRules);
}

// Khởi tạo tài khoản Admin mặc định (admin / 123456 - lưu mã băm bcrypt an toàn)
function load_admin_credentials($authFile) {
    if (file_exists($authFile)) {
        $data = include $authFile;
        if (is_array($data) && !empty($data['username']) && !empty($data['password_hash'])) {
            return $data;
        }
    }
    $default = [
        'username'      => 'admin',
        'password_hash' => password_hash('123456', PASSWORD_DEFAULT)
    ];
    save_admin_credentials($authFile, $default['username'], '123456');
    return $default;
}

function save_admin_credentials($authFile, $username, $plainPassword) {
    $hash = password_hash($plainPassword, PASSWORD_DEFAULT);
    $export = "<?php\nreturn " . var_export([
        'username'      => $username,
        'password_hash' => $hash
    ], true) . ";\n";
    @file_put_contents($authFile, $export, LOCK_EX);
}

function send_json($statusCode, $payload) {
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function require_admin() {
    if (empty($_SESSION['ttt_admin_logged_in'])) {
        send_json(401, [
            'ok'    => false,
            'error' => 'Phiên đăng nhập Admin đã hết hạn. Vui lòng đăng nhập lại!'
        ]);
    }
}

function sanitize_audio_filename($rawName) {
    $base = basename((string)$rawName);
    $ext  = strtolower(pathinfo($base, PATHINFO_EXTENSION));
    $allowed = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
    if (!in_array($ext, $allowed, true)) {
        $ext = 'mp3';
    }
    $stem = pathinfo($base, PATHINFO_FILENAME);
    // Chuyển ký tự có dấu tiếng Việt sang ASCII gọn đẹp cho URL trên Linux / Hostinger
    $vietMap = [
        'à'=>'a','á'=>'a','ạ'=>'a','ả'=>'a','ã'=>'a','â'=>'a','ầ'=>'a','ấ'=>'a','ậ'=>'a','ẩ'=>'a','ẫ'=>'a','ă'=>'a','ằ'=>'a','ắ'=>'a','ặ'=>'a','ẳ'=>'a','ẵ'=>'a',
        'è'=>'e','é'=>'e','ẹ'=>'e','ẻ'=>'e','ẽ'=>'e','ê'=>'e','ề'=>'e','ế'=>'e','ệ'=>'e','ể'=>'e','ễ'=>'e',
        'ì'=>'i','í'=>'i','ị'=>'i','ỉ'=>'i','ĩ'=>'i',
        'ò'=>'o','ó'=>'o','ọ'=>'o','ỏ'=>'o','õ'=>'o','ô'=>'o','ồ'=>'o','ố'=>'o','ộ'=>'o','ổ'=>'o','ỗ'=>'o','ơ'=>'o','ờ'=>'o','ớ'=>'o','ợ'=>'o','ở'=>'o','ỡ'=>'o',
        'ù'=>'u','ú'=>'u','ụ'=>'u','ủ'=>'u','ũ'=>'u','ư'=>'u','ừ'=>'u','ứ'=>'u','ự'=>'u','ử'=>'u','ữ'=>'u',
        'ỳ'=>'y','ý'=>'y','ỵ'=>'y','ỷ'=>'y','ỹ'=>'y','đ'=>'d',
        'À'=>'A','Á'=>'A','Ạ'=>'A','Ả'=>'A','Ã'=>'A','Â'=>'A','Ầ'=>'A','Ấ'=>'A','Ậ'=>'A','Ẩ'=>'A','Ẫ'=>'A','Ă'=>'A','Ằ'=>'A','Ắ'=>'A','Ặ'=>'A','Ẳ'=>'A','Ẵ'=>'A',
        'È'=>'E','É'=>'E','Ẹ'=>'E','Ẻ'=>'E','Ẽ'=>'E','Ê'=>'E','Ề'=>'E','Ế'=>'E','Ệ'=>'E','Ể'=>'E','Ễ'=>'E',
        'Ì'=>'I','Í'=>'I','Ị'=>'I','Ỉ'=>'I','Ĩ'=>'I',
        'Ò'=>'O','Ó'=>'O','Ọ'=>'O','Ỏ'=>'O','Õ'=>'O','Ô'=>'O','Ồ'=>'O','Ố'=>'O','Ộ'=>'O','Ổ'=>'O','Ỗ'=>'O','Ơ'=>'O','Ờ'=>'O','Ớ'=>'O','Ợ'=>'O','Ở'=>'O','Ỡ'=>'O',
        'Ù'=>'U','Ú'=>'U','Ụ'=>'U','Ủ'=>'U','Ũ'=>'U','Ư'=>'U','Ừ'=>'U','Ứ'=>'U','Ự'=>'U','Ử'=>'U','Ữ'=>'U',
        'Ỳ'=>'Y','Ý'=>'Y','Ỵ'=>'Y','Ỷ'=>'Y','Ỹ'=>'Y','Đ'=>'D'
    ];
    $stem = strtr($stem, $vietMap);
    $stem = preg_replace('/[^a-zA-Z0-9\s\-_]/', '', $stem);
    $stem = preg_replace('/\s+/', '-', trim($stem));
    if ($stem === '') {
        $stem = 'nhac-xua';
    }
    $stem = substr($stem, 0, 60);
    $stamp = round(microtime(true) * 1000);
    return $stamp . '-' . $stem . '.' . $ext;
}

$action = isset($_GET['action']) ? (string)$_GET['action'] : '';
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

// 1. PING kiểm tra kết nối Hostinger PHP
if ($action === 'ping') {
    send_json(200, [
        'ok'       => true,
        'engine'   => 'php',
        'loggedIn' => !empty($_SESSION['ttt_admin_logged_in'])
    ]);
}

// 2. ĐĂNG NHẬP ADMIN
if ($action === 'login' && $method === 'POST') {
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);
    $user = trim((string)($body['username'] ?? ''));
    $pass = (string)($body['password'] ?? '');

    $cred = load_admin_credentials($authFile);
    if ($user === $cred['username'] && password_verify($pass, $cred['password_hash'])) {
        session_regenerate_id(true);
        $_SESSION['ttt_admin_logged_in'] = true;
        $_SESSION['ttt_admin_user']      = $cred['username'];
        send_json(200, ['ok' => true, 'username' => $cred['username']]);
    }
    send_json(401, ['ok' => false, 'error' => 'Sai tài khoản hoặc mật khẩu Admin!']);
}

// 3. ĐĂNG XUẤT ADMIN
if ($action === 'logout') {
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
    send_json(200, ['ok' => true]);
}

// 4. ĐỔI TÀI KHOẢN & MẬT KHẨU ADMIN
if ($action === 'change-auth' && $method === 'POST') {
    require_admin();
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);
    $newU = trim((string)($body['username'] ?? ''));
    $newP = (string)($body['password'] ?? '');
    if ($newU === '' || strlen($newP) < 4) {
        send_json(400, ['ok' => false, 'error' => 'Tài khoản không được trống và mật khẩu tối thiểu 4 ký tự!']);
    }
    save_admin_credentials($authFile, $newU, $newP);
    $_SESSION['ttt_admin_user'] = $newU;
    send_json(200, ['ok' => true, 'username' => $newU]);
}

// 5. ĐỌC DỮ LIỆU TRANG WEB (Công khai cho người nghe nhạc)
if ($action === 'data' && $method === 'GET') {
    if (file_exists($dbFile)) {
        $rawJson = file_get_contents($dbFile);
        $decoded = json_decode($rawJson, true);
        if (is_array($decoded)) {
            unset($decoded['adminAuth']);
            send_json(200, ['initialized' => true, 'db' => $decoded]);
        }
    }
    send_json(200, ['initialized' => false, 'db' => null]);
}

// 6. LƯU DỮ LIỆU TRANG WEB (Chỉ Admin mới được lưu)
if ($action === 'data' && $method === 'POST') {
    require_admin();
    $rawBody = file_get_contents('php://input');
    $decoded = json_decode($rawBody, true);
    if (!is_array($decoded) || !isset($decoded['songs'])) {
        send_json(400, ['ok' => false, 'error' => 'Dữ liệu JSON không hợp lệ!']);
    }
    // Không bao giờ lưu mật khẩu vào site-db.json công khai
    unset($decoded['adminAuth']);
    $pretty = json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (@file_put_contents($dbFile, $pretty, LOCK_EX) === false) {
        send_json(500, ['ok' => false, 'error' => 'Không ghi được site-db.json (kiểm tra quyền ghi 755/644 trên Hostinger)!']);
    }
    send_json(200, ['ok' => true]);
}

// 7. UPLOAD FILE MP3 LÊN THƯ MỤC uploads/ (Chỉ Admin)
if ($action === 'upload-mp3' && $method === 'POST') {
    require_admin();

    // Hỗ trợ cả Multipart Form ($_FILES) lẫn Raw Binary Stream (XHR)
    if (!empty($_FILES['file']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
        $origName = $_FILES['file']['name'] ?? 'track.mp3';
        $safeFile = sanitize_audio_filename($origName);
        $destPath = $uploadsDir . DIRECTORY_SEPARATOR . $safeFile;
        if (!@move_uploaded_file($_FILES['file']['tmp_name'], $destPath)) {
            send_json(500, ['ok' => false, 'error' => 'Không thể lưu file vào thư mục uploads/!']);
        }
        @chmod($destPath, 0644);
        send_json(200, [
            'ok'       => true,
            'url'      => 'uploads/' . $safeFile,
            'filename' => $safeFile
        ]);
    }

    $origName = $_GET['filename'] ?? 'track.mp3';
    $safeFile = sanitize_audio_filename($origName);
    $destPath = $uploadsDir . DIRECTORY_SEPARATOR . $safeFile;

    $inStream  = fopen('php://input', 'rb');
    $outStream = @fopen($destPath, 'wb');
    if (!$inStream || !$outStream) {
        send_json(500, ['ok' => false, 'error' => 'Không mở được thư mục uploads/ để ghi file (kiểm tra CHMOD 755)!']);
    }

    $written = stream_copy_to_stream($inStream, $outStream);
    fclose($inStream);
    fclose($outStream);

    if ($written === false || $written <= 0) {
        @unlink($destPath);
        send_json(400, ['ok' => false, 'error' => 'File tải lên rỗng hoặc vượt giới hạn upload_max_filesize của PHP trên Hostinger!']);
    }

    @chmod($destPath, 0644);
    send_json(200, [
        'ok'       => true,
        'url'      => 'uploads/' . $safeFile,
        'filename' => $safeFile
    ]);
}

// 8. XÓA FILE MP3 TRONG uploads/ (Chỉ Admin — dùng POST để không bị tường lửa chặn DELETE)
if (($action === 'delete-mp3' && $method === 'POST') || ($action === 'upload-mp3' && $method === 'DELETE')) {
    require_admin();
    $relFile = (string)($_GET['file'] ?? '');
    if (strpos($relFile, 'uploads/') === 0) {
        $onlyName = basename($relFile);
        $target   = $uploadsDir . DIRECTORY_SEPARATOR . $onlyName;
        if (is_file($target)) {
            @unlink($target);
        }
    }
    send_json(200, ['ok' => true]);
}

// 9. DANH SÁCH FILE TRONG THƯ MỤC uploads/ (Chỉ Admin)
if ($action === 'uploads-list' && $method === 'GET') {
    require_admin();
    $items = [];
    if (is_dir($uploadsDir)) {
        $entries = scandir($uploadsDir);
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..' || $entry[0] === '.') {
                continue;
            }
            $full = $uploadsDir . DIRECTORY_SEPARATOR . $entry;
            if (is_file($full)) {
                $mtime   = filemtime($full) ?: 0;
                $items[] = [
                    'filename' => $entry,
                    'url'      => 'uploads/' . $entry,
                    'size'     => filesize($full) ?: 0,
                    'modified' => date('Y-m-d H:i:s', $mtime),
                    '_ts'      => $mtime
                ];
            }
        }
        usort($items, function ($a, $b) {
            return $b['_ts'] <=> $a['_ts'];
        });
        foreach ($items as &$it) {
            unset($it['_ts']);
        }
    }
    send_json(200, ['ok' => true, 'files' => $items]);
}

send_json(404, ['ok' => false, 'error' => 'API action không tồn tại']);
