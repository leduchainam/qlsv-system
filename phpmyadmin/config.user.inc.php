<?php
/* Cấu hình hỗ trợ Nginx Reverse Proxy SSL */
if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
    $_SERVER['HTTPS'] = 'on';
}

if (!empty($_SERVER['HTTP_HOST'])) {
    $cfg['PmaAbsoluteUri'] = 'https://' . $_SERVER['HTTP_HOST'] . '/phpmyadmin/';
} else {
    $cfg['PmaAbsoluteUri'] = '/phpmyadmin/';
}
