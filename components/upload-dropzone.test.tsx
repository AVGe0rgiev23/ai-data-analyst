// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UploadDropzone } from './upload-dropzone';
import { MAX_UPLOAD_BYTES } from '@/lib/ingest/limits';

describe('UploadDropzone', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('states the limit the server enforces', () => {
    expect(MAX_UPLOAD_BYTES).toBe(100 * 1024 * 1024);
    render(<UploadDropzone onUploaded={() => undefined} />);
    expect(screen.getByText('CSV, up to 100 MB')).toBeDefined();
  });

  it('refuses a file over the limit without sending it', () => {
    const open = vi.fn();
    vi.stubGlobal(
      'XMLHttpRequest',
      class {
        upload = { addEventListener: () => undefined };
        open = open;
        addEventListener() {}
        send() {}
      },
    );

    const { container } = render(<UploadDropzone onUploaded={() => undefined} />);
    const file = new File(['order_id\n1\n'], 'huge.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });

    expect(screen.getByRole('alert').textContent).toContain('100 MB');
    expect(open).not.toHaveBeenCalled();
  });
});
