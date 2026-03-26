import { useEffect, useState } from 'react';
import type { ApiClient } from '../services/api';

type Props = {
  previewDataUrl: string;
  defaultWatermark: string;
  apiClient: ApiClient;
  onPublished: () => void;
  onClose: () => void;
};

export default function PublishDesignModal({
  previewDataUrl,
  defaultWatermark,
  apiClient,
  onPublished,
  onClose,
}: Props) {
  const [watermark, setWatermark] = useState(defaultWatermark);
  const [previewUrl, setPreviewUrl] = useState(previewDataUrl);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [licenseType, setLicenseType] = useState<'personal' | 'commercial'>('personal');
  const [price, setPrice] = useState('');
  const [estimatedTime, setEstimatedTime] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    applyWatermark(defaultWatermark);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 即時重新繪製浮水印預覽
  function applyWatermark(text: string) {
    setWatermark(text);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      drawWatermark(ctx, canvas.width, canvas.height, text);
      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = previewDataUrl; // 永遠從原圖重新套用
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('請輸入標題'); return; }
    setSaving(true);
    setError('');
    try {
      const parsedTags = tags.split(/[、\s]+/).map((t) => t.trim()).filter(Boolean);
      const parsedPrice = price.trim() ? parseInt(price.trim(), 10) : undefined;
      await apiClient.createDesign({
        title: title.trim(),
        description: description.trim() || undefined,
        tags: parsedTags,
        licenseType,
        price: isNaN(parsedPrice as number) ? undefined : parsedPrice,
        estimatedTime: estimatedTime.trim() || undefined,
        previewImage: previewUrl,
        status,
      });
      onPublished();
    } catch (err: any) {
      setError('上架失敗：' + (err?.message ?? '未知錯誤'));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <h3>上架到市集</h3>
          <button className="ghost topbar-icon" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        <div className="publish-layout">
          {/* 左：預覽圖 + 浮水印設定 */}
          <div className="publish-preview-col">
            <p className="hint" style={{ fontSize: 13, marginBottom: 6 }}>預覽圖（含浮水印）</p>
            <img
              src={previewUrl}
              alt="設計預覽"
              className="publish-preview-img"
            />
            <label style={{ marginTop: 10 }}>
              浮水印文字
              <input
                type="text"
                value={watermark}
                onChange={(e) => applyWatermark(e.target.value)}
                placeholder="留空不加浮水印"
                maxLength={50}
              />
            </label>
            <p className="hint" style={{ fontSize: 12 }}>可在「個人資料」設定預設浮水印</p>
          </div>

          {/* 右：設計圖資料表單 */}
          <form className="publish-form-col" onSubmit={handleSubmit}>
            <label>
              標題 *
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="設計圖名稱"
                maxLength={100}
                autoFocus
              />
            </label>
            <label>
              說明
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="作品描述、尺寸、使用色板..."
                rows={3}
                maxLength={1000}
                style={{ resize: 'vertical' }}
              />
            </label>
            <label>
              標籤
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="遊戲、動漫（頓號分隔）"
              />
            </label>
            <div className="row two">
              <label>
                授權類型
                <select value={licenseType} onChange={(e) => setLicenseType(e.target.value as 'personal' | 'commercial')}>
                  <option value="personal">個人使用</option>
                  <option value="commercial">商業授權</option>
                </select>
              </label>
              <label>
                參考售價（NT$）
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="留空為面議"
                  min={0}
                  max={99999}
                />
              </label>
            </div>
            <label>
              預計製作時間
              <input
                type="text"
                value={estimatedTime}
                onChange={(e) => setEstimatedTime(e.target.value)}
                placeholder="留空顯示「由創作者告知」，例：3-5天"
                maxLength={100}
              />
            </label>
            <label>
              發布狀態
              <select value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}>
                <option value="published">立即公開上架</option>
                <option value="draft">存為草稿</option>
              </select>
            </label>

            {error && <p className="status error">{error}</p>}

            <div className="row two" style={{ marginTop: 12 }}>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? '上架中...' : status === 'published' ? '公開上架' : '存為草稿'}
              </button>
              <button type="button" className="ghost" onClick={onClose}>
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// 在 canvas ctx 上繪製浮水印文字（供外部呼叫）
export function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  if (!text.trim()) return;
  const fontSize = Math.max(12, Math.min(22, Math.floor(Math.min(w, h) / 10)));
  ctx.save();
  ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
  const textW = ctx.measureText(text).width;
  const stepX = textW + fontSize * 3;
  const stepY = fontSize * 4;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.translate(-w, -h);
  for (let row = -2; row < Math.ceil((h * 2) / stepY) + 2; row++) {
    const offset = (row % 2) * (stepX / 2);
    for (let col = -2; col < Math.ceil((w * 2) / stepX) + 2; col++) {
      const x = col * stepX + offset;
      const y = row * stepY;
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#000';
      ctx.fillText(text, x + 1, y + 1);
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();
}
