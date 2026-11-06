import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { LOCALES } from '../i18n/i18n';
import { DOCUMENT_TEMPLATES, findTemplate, templateHref, templateRequest } from './create-templates';
import { readMarkdown, writeMarkdown } from './editor-markdown';
import { editorExtensions } from './editor-schema';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function headings(markdown: string): string[] {
  return markdown.split('\n').flatMap((line) => (line.startsWith('## ') ? [line.slice(3)] : []));
}

describe('the built-in templates', () => {
  it('are the lab, meeting notes, incident runbook, exercise and comparison, each in Vietnamese and English', () => {
    expect(DOCUMENT_TEMPLATES.map((t) => t.id)).toEqual(['lab', 'meeting', 'runbook', 'exercise', 'compare']);
    for (const template of DOCUMENT_TEMPLATES) {
      for (const locale of LOCALES) {
        const text = template.text[locale];
        expect(text.name.trim()).not.toBe('');
        expect(text.title).toMatch(/\[.+\]/);
        expect(headings(text.body).length).toBeGreaterThanOrEqual(4);
      }
      // the same outline in both languages
      expect(headings(template.text.vi.body)).toHaveLength(headings(template.text.en.body).length);
    }
  });

  it('give a lab the sections Mục tiêu, Chuẩn bị, Các bước, Kiểm tra, Lỗi thường gặp', () => {
    const lab = findTemplate('lab');
    expect(lab && headings(lab.text.vi.body)).toEqual(['Mục tiêu', 'Chuẩn bị', 'Các bước', 'Kiểm tra', 'Lỗi thường gặp']);
    expect(lab && headings(lab.text.en.body)).toEqual(['Goal', 'Before you start', 'Steps', 'Check', 'Common mistakes']);
  });

  it('give an exercise its review questions', () => {
    const exercise = findTemplate('exercise');
    expect(exercise && headings(exercise.text.vi.body)).toContain('Câu hỏi ôn tập');
  });

  it('are found by id from a URL, and nothing else is', () => {
    expect(findTemplate('runbook')?.type).toBe('process');
    expect(findTemplate('compare')?.type).toBe('note');
    expect(findTemplate('')).toBeNull();
    expect(findTemplate(null)).toBeNull();
    expect(findTemplate('__proto__')).toBeNull();
    expect(templateHref('meeting')).toBe('/new?template=meeting');
  });

  it('make the draft in the reader’s language, with its kind and planet', () => {
    const meeting = findTemplate('meeting');
    if (!meeting) throw new Error('no meeting template');
    expect(templateRequest(meeting, 'en')).toEqual({ type: 'note', title: 'Meeting: [topic] · [date]', body: meeting.text.en.body, lang: 'en', planet: 'cyan' });
    expect(templateRequest(meeting, 'vi').lang).toBe('vi');
  });

  it('open in the editor with every section, numbered list and table kept', () => {
    for (const template of DOCUMENT_TEMPLATES) {
      for (const locale of LOCALES) {
        const body = template.text[locale].body;
        editor?.destroy();
        editor = new Editor({ extensions: editorExtensions(''), content: '' });
        editor.commands.setContent(readMarkdown(editor, body));
        // the editor escapes a lone bracket as Markdown does (`\[topic\]`); it reads the same
        const written = writeMarkdown(editor).replace(/\\([[\]])/g, '$1');
        expect(headings(written)).toEqual(headings(body));
        // numbered lists stay lists to write in (not the editor's step cards, which show one letter per step)
        const types = (editor.getJSON().content ?? []).map((node) => node.type);
        expect(types).not.toContain('steps');
        expect(types.filter((type) => type === 'orderedList').length).toBe(body.split('\n').filter((line) => line.startsWith('1. ')).length);
        expect(written.split('\n').filter((line) => line.startsWith('| ---')).length).toBe(body.split('\n').filter((line) => line.startsWith('| ---')).length);
      }
    }
  });
});
