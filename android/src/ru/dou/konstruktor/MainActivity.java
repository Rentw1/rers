package ru.dou.konstruktor;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {

    private static final int REQ_FILE = 101;
    private static final int REQ_STORAGE = 102;
    private static final int MAX_RESPONSE = 20 * 1024 * 1024;

    private WebView webView;
    private WebView printView;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#3949AB"));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#F4F6FB"));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadsImagesAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(true);

        webView.addJavascriptInterface(new Bridge(), "Android");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme();
                if ("file".equals(scheme)) return false;
                openExternal(u.toString());
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent i = params.createIntent();
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(i, REQ_FILE);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    toast("Не удалось открыть выбор файла");
                    return false;
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                return super.onConsoleMessage(m);
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl("file:///android_asset/www/index.html");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("(window.onAndroidBack ? window.onAndroidBack() : false)", new ValueCallback<String>() { public void onReceiveValue(String value) {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        }});
    }

    @Override
    protected void onDestroy() {
        pool.shutdownNow();
        if (printView != null) printView.destroy();
        webView.destroy();
        super.onDestroy();
    }

    private void toast(final String msg) {
        ui.post(new Runnable() { public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show(); } });
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            toast("Нет приложения для открытия ссылки");
        }
    }

    private void callJs(final String fn, final Object... args) {
        StringBuilder sb = new StringBuilder("window.").append(fn).append("&&window.").append(fn).append('(');
        for (int i = 0; i < args.length; i++) {
            if (i > 0) sb.append(',');
            Object a = args[i];
            if (a instanceof String) sb.append(JSONObject.quote((String) a));
            else sb.append(String.valueOf(a));
        }
        sb.append(')');
        final String js = sb.toString();
        ui.post(new Runnable() { public void run() { webView.evaluateJavascript(js, null); } });
    }

    private static byte[] readAll(InputStream in) throws Exception {
        if (in == null) return new byte[0];
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        int total = 0;
        try {
            while ((n = in.read(buf)) != -1) {
                total += n;
                if (total > MAX_RESPONSE) throw new Exception("Слишком большой ответ сервера");
                bos.write(buf, 0, n);
            }
        } finally {
            in.close();
        }
        return bos.toByteArray();
    }

    private JSONObject writeDownload(String name, String mime, byte[] bytes) throws Exception {
        JSONObject res = new JSONObject();
        String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = getContentResolver();
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
            cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/КонструкторДОУ");
            cv.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) throw new Exception("Не удалось создать файл");
            OutputStream os = cr.openOutputStream(uri);
            if (os == null) throw new Exception("Нет доступа к файлу");
            try {
                os.write(bytes);
            } finally {
                os.close();
            }
            cv.clear();
            cv.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, cv, null, null);
            res.put("ok", true);
            res.put("uri", uri.toString());
            res.put("path", "Загрузки/КонструкторДОУ/" + safe);
        } else {
            if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                ui.post(new Runnable() { public void run() { requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE); } });
                res.put("ok", false);
                res.put("error", "Разрешите доступ к памяти и повторите сохранение");
                return res;
            }
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "КонструкторДОУ");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("Не удалось создать папку");
            File f = new File(dir, safe);
            FileOutputStream fos = new FileOutputStream(f);
            try {
                fos.write(bytes);
            } finally {
                fos.close();
            }
            res.put("ok", true);
            res.put("uri", Uri.fromFile(f).toString());
            res.put("path", f.getAbsolutePath());
        }
        return res;
    }

    private Uri shareableUri(String name, String mime, byte[] bytes) throws Exception {
        JSONObject r = writeDownload(name, mime, bytes);
        if (!r.optBoolean("ok")) throw new Exception(r.optString("error", "Ошибка сохранения"));
        Uri u = Uri.parse(r.getString("uri"));
        if ("file".equals(u.getScheme()) && Build.VERSION.SDK_INT >= 24) {
            android.os.StrictMode.setVmPolicy(new android.os.StrictMode.VmPolicy.Builder().build());
        }
        return u;
    }

    public class Bridge {

        @JavascriptInterface
        public String version() {
            return "1.0.0";
        }

        @JavascriptInterface
        public void toast(String msg) {
            MainActivity.this.toast(msg);
        }

        @JavascriptInterface
        public void openUrl(String url) {
            if (url != null && (url.startsWith("https://") || url.startsWith("http://"))) openExternal(url);
        }

        @JavascriptInterface
        public void http(final String id, final String method, final String url, final String headersJson,
                         final String body, final int timeoutMs, final boolean asBase64) {
            pool.execute(new Runnable() { public void run() {
                HttpURLConnection c = null;
                try {
                    if (url == null || !url.startsWith("https://")) throw new Exception("Разрешены только адреса https://");
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setRequestMethod(method == null || method.isEmpty() ? "GET" : method);
                    int t = timeoutMs > 0 ? timeoutMs : 120000;
                    c.setConnectTimeout(Math.min(t, 30000));
                    c.setReadTimeout(t);
                    c.setInstanceFollowRedirects(true);
                    c.setRequestProperty("User-Agent", "KonstruktorDOU/1.0 Android");
                    if (headersJson != null && !headersJson.isEmpty()) {
                        JSONObject h = new JSONObject(headersJson);
                        Iterator<String> it = h.keys();
                        while (it.hasNext()) {
                            String k = it.next();
                            c.setRequestProperty(k, h.getString(k));
                        }
                    }
                    if (body != null && !body.isEmpty() && !"GET".equals(c.getRequestMethod())) {
                        c.setDoOutput(true);
                        byte[] b = body.getBytes(StandardCharsets.UTF_8);
                        c.setFixedLengthStreamingMode(b.length);
                        OutputStream os = c.getOutputStream();
                        try {
                            os.write(b);
                        } finally {
                            os.close();
                        }
                    }
                    int code = c.getResponseCode();
                    InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    byte[] data = readAll(in);
                    String out;
                    if (asBase64 && code < 400) {
                        String ct = c.getContentType();
                        out = "data:" + (ct == null ? "image/png" : ct.split(";")[0]) + ";base64," + Base64.encodeToString(data, Base64.NO_WRAP);
                    } else {
                        out = new String(data, StandardCharsets.UTF_8);
                    }
                    callJs("__nativeHttp", id, code < 400, code, out);
                } catch (Throwable e) {
                    String m = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                    callJs("__nativeHttp", id, false, 0, m);
                } finally {
                    if (c != null) c.disconnect();
                }
            }});
        }

        @JavascriptInterface
        public String saveFile(String name, String mime, String data, boolean isBase64) {
            try {
                byte[] bytes = isBase64 ? Base64.decode(data, Base64.DEFAULT) : data.getBytes(StandardCharsets.UTF_8);
                return writeDownload(name, mime, bytes).toString();
            } catch (Throwable e) {
                return "{\"ok\":false,\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}";
            }
        }

        @JavascriptInterface
        public String shareFile(String name, String mime, String data, boolean isBase64) {
            try {
                byte[] bytes = isBase64 ? Base64.decode(data, Base64.DEFAULT) : data.getBytes(StandardCharsets.UTF_8);
                final Uri u = shareableUri(name, mime, bytes);
                final String m = mime;
                ui.post(new Runnable() { public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType(m);
                    i.putExtra(Intent.EXTRA_STREAM, u);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        startActivity(Intent.createChooser(i, "Отправить"));
                    } catch (Exception e) {
                        MainActivity.this.toast("Нет приложения для отправки");
                    }
                }});
                return "{\"ok\":true}";
            } catch (Throwable e) {
                return "{\"ok\":false,\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}";
            }
        }

        @JavascriptInterface
        public void shareText(final String text, final String title) {
            ui.post(new Runnable() { public void run() {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_SUBJECT, title);
                i.putExtra(Intent.EXTRA_TEXT, text);
                try {
                    startActivity(Intent.createChooser(i, "Отправить"));
                } catch (Exception e) {
                    MainActivity.this.toast("Нет приложения для отправки");
                }
            }});
        }

        @JavascriptInterface
        public void print(final String html, final String jobName) {
            ui.post(new Runnable() { public void run() {
                if (printView != null) printView.destroy();
                printView = new WebView(MainActivity.this);
                printView.getSettings().setJavaScriptEnabled(false);
                printView.getSettings().setLoadsImagesAutomatically(true);
                printView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(final WebView view, String url) {
                        ui.postDelayed(new Runnable() { public void run() {
                            try {
                                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                                String job = (jobName == null || jobName.isEmpty()) ? "Занятие" : jobName;
                                PrintDocumentAdapter ad = view.createPrintDocumentAdapter(job);
                                pm.print(job, ad, new PrintAttributes.Builder()
                                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                            } catch (Exception e) {
                                MainActivity.this.toast("Печать недоступна: " + e.getMessage());
                            }
                        }}, 600);
                    }
                });
                printView.setVisibility(View.INVISIBLE);
                printView.loadDataWithBaseURL("file:///android_asset/www/", html, "text/html", "UTF-8", null);
            }});
        }
    }
}
