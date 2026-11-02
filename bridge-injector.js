/**
 * ==============================================================================
 * 🍿 سكريبت الجسر (Bridge Injector) لربط أي موقع أفلام خارجي بقاعة السينما
 * ==============================================================================
 * آلية العمل:
 * يتم حقن هذا السكريبت في أي موقع أو تبويب خارجي يفتحه المستخدم.
 * يبحث السكريبت تلقائياً عن وسم <video> في الصفحة، ويربط أحداث التشغيل والإيقاف
 * والتأخير والتقديم (Play, Pause, Seek) مباشرة بخادم التزامن التابع لسهرة بلس.
 */

(function () {
  console.log('[Hyperbeam Cinema Bridge] جاري البحث عن مشغل الفيديو في الموقع...');

  let attachedVideo = null;
  let isRemoteCommand = false;

  const findVideoInterval = setInterval(() => {
    const video = document.querySelector('video');
    if (video && video !== attachedVideo) {
      attachedVideo = video;
      clearInterval(findVideoInterval);
      console.log('✅ تم العثور على مشغل الفيديو وربطه بقاعة السينما بنجاح!');

      // رصد تفاعلات المستخدم المحلي وإرسالها
      video.addEventListener('play', () => {
        if (isRemoteCommand) return;
        window.postMessage({
          type: 'CINEMA_SYNC_ACTION',
          action: 'play',
          time: video.currentTime
        }, '*');
      });

      video.addEventListener('pause', () => {
        if (isRemoteCommand) return;
        window.postMessage({
          type: 'CINEMA_SYNC_ACTION',
          action: 'pause',
          time: video.currentTime
        }, '*');
      });

      video.addEventListener('seeked', () => {
        if (isRemoteCommand) return;
        window.postMessage({
          type: 'CINEMA_SYNC_ACTION',
          action: 'seek',
          time: video.currentTime
        }, '*');
      });

      // استقبال أوامر القاعة القادمة من الأصدقاء وتطبيقها على الفيديو
      window.addEventListener('message', (event) => {
        if (!event.data || event.data.type !== 'REMOTE_CINEMA_ACTION') return;

        isRemoteCommand = true;
        const { action, time } = event.data;

        if (time !== undefined && Math.abs(video.currentTime - time) > 0.45) {
          video.currentTime = time;
        }

        if (action === 'play') {
          video.play().catch(() => {});
        } else if (action === 'pause') {
          video.pause();
        }

        setTimeout(() => {
          isRemoteCommand = false;
        }, 400);
      });
    }
  }, 1000);
})();
