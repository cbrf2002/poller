import { newItemId } from '../shared/ids';
import {
  FIELD_TYPE_NAMES,
  FIELD_TYPES,
  LIMITS,
  QUESTION_TYPE_NAMES,
  QUESTION_TYPES,
  type FieldType,
  type ProfileField,
  type Question,
  type QuestionType,
  type SetContent,
  type SetStatus,
} from '../shared/model';
import { publishProblems } from '../shared/validate';
import { h, readJson } from './dom';

interface SetData {
  id: string;
  status: SetStatus;
  content: SetContent;
  submitted: number;
}

/** Common details people ask for, one tap away. */
const PRESETS: { label: string; type: FieldType }[] = [
  { label: 'Full name', type: 'text' },
  { label: 'Email', type: 'email' },
  { label: 'Birthday', type: 'date' },
  { label: 'Phone', type: 'tel' },
  { label: 'Company', type: 'text' },
];

function startEditor(set: SetData, root: HTMLElement): void {
  const content = set.content;
  const saveState = document.querySelector<HTMLElement>('[data-save-state]');
  const problemsBox = document.querySelector<HTMLElement>('[data-problems]');

  // ── Saving ──────────────────────────────────────────────────
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;
  let dirty = false;
  let failures = 0;

  function showState(
    text: string,
    state: 'idle' | 'busy' | 'error' = 'idle'
  ): void {
    if (!saveState) return;
    saveState.textContent = text;
    saveState.dataset.state = state;
  }

  function showProblems(problems: string[]): void {
    if (!problemsBox) return;
    problemsBox.replaceChildren();
    if (!problems.length) return;
    const lead =
      set.status === 'draft'
        ? 'Before you can publish:'
        : 'Participants still see the last complete version until you fix:';
    problemsBox.append(
      h(
        'div',
        { class: 'notice warn', role: 'status' },
        h('strong', {}, lead),
        h(
          'ul',
          {},
          problems.map(p => h('li', {}, p))
        )
      )
    );
  }

  async function send(): Promise<void> {
    dirty = false;
    showState('Saving…', 'busy');
    const response = await fetch(`/admin/api/sets/${set.id}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    if (response.status === 401) {
      showState(
        'Signed out. Sign in again in another tab, then keep editing.',
        'error'
      );
      dirty = true;
      return;
    }
    if (!response.ok) throw new Error(`Save failed: ${response.status}`);
    const outcome = (await response.json()) as {
      problems: string[];
      live: boolean;
    };
    failures = 0;
    showProblems(outcome.problems);
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    showState(
      set.status === 'draft'
        ? `Draft saved ${time}`
        : outcome.live
          ? `Saved and live ${time}`
          : `Saved ${time} · not live yet`
    );
  }

  function save(): Promise<void> {
    clearTimeout(timer);
    if (inFlight) {
      dirty = true;
      return inFlight;
    }
    inFlight = send()
      .catch(() => {
        failures++;
        dirty = true;
        showState('Couldn’t save. Retrying…', 'error');
        timer = setTimeout(save, Math.min(30000, 1000 * 2 ** failures));
      })
      .finally(() => {
        inFlight = null;
        if (dirty && failures === 0) scheduleSave(200);
      });
    return inFlight;
  }

  function scheduleSave(delay = 700): void {
    dirty = true;
    showState('Unsaved changes', 'busy');
    clearTimeout(timer);
    timer = setTimeout(save, delay);
  }

  async function flush(): Promise<void> {
    if (inFlight) await inFlight;
    if (dirty) await save();
  }

  window.addEventListener('beforeunload', event => {
    if (dirty || inFlight) event.preventDefault();
  });

  // Publishing must see the latest draft, so pending edits go first.
  for (const form of document.querySelectorAll<HTMLFormElement>(
    'form[action$="/status"]'
  )) {
    form.addEventListener('submit', event => {
      if (!dirty && !inFlight) return;
      event.preventDefault();
      const submitter = event.submitter as HTMLButtonElement | null;
      flush().then(() => form.requestSubmit(submitter ?? undefined));
    });
  }

  // ── Building blocks ─────────────────────────────────────────
  function textInput(
    label: string,
    value: string,
    max: number,
    onChange: (v: string) => void,
    attrs: Record<string, string> = {}
  ): HTMLElement {
    const id = `in-${newItemId()}`;
    return h(
      'div',
      { class: 'field' },
      h('label', { class: 'field-label', for: id }, label),
      h('input', {
        class: 'input',
        id,
        value,
        maxlength: max,
        oninput: (e: Event) => {
          onChange((e.target as HTMLInputElement).value);
          scheduleSave();
        },
        ...attrs,
      })
    );
  }

  function typePicker<T extends string>(
    label: string,
    value: T,
    types: readonly T[],
    names: Record<T, string>,
    onChange: (v: T) => void
  ): HTMLElement {
    const id = `in-${newItemId()}`;
    return h(
      'div',
      { class: 'field' },
      h('label', { class: 'field-label', for: id }, label),
      h(
        'select',
        {
          class: 'select',
          id,
          onchange: (e: Event) => {
            onChange((e.target as HTMLSelectElement).value as T);
            render();
            scheduleSave(200);
          },
        },
        types.map(t =>
          h('option', { value: t, selected: t === value }, names[t])
        )
      )
    );
  }

  function requiredToggle(
    value: boolean,
    onChange: (v: boolean) => void
  ): HTMLElement {
    return h(
      'label',
      { class: 'toggle' },
      h('input', {
        type: 'checkbox',
        checked: value,
        onchange: (e: Event) => {
          onChange((e.target as HTMLInputElement).checked);
          scheduleSave(200);
        },
      }),
      'Required'
    );
  }

  function tool(
    glyph: string,
    label: string,
    action: () => void,
    opts: { disabled?: boolean; danger?: boolean } = {}
  ) {
    return h(
      'button',
      {
        type: 'button',
        class: opts.danger ? 'tool-btn danger' : 'tool-btn',
        'aria-label': label,
        title: label,
        disabled: opts.disabled,
        onclick: () => {
          action();
          render();
          scheduleSave(200);
        },
      },
      glyph
    );
  }

  function move<T>(list: T[], from: number, to: number): void {
    const [item] = list.splice(from, 1);
    if (item !== undefined) list.splice(to, 0, item);
  }

  function itemTools<T>(list: T[], index: number, name: string): HTMLElement {
    return h(
      'div',
      { class: 'item-tools' },
      tool('↑', `Move ${name} up`, () => move(list, index, index - 1), {
        disabled: index === 0,
      }),
      tool('↓', `Move ${name} down`, () => move(list, index, index + 1), {
        disabled: index === list.length - 1,
      }),
      tool('✕', `Remove ${name}`, () => list.splice(index, 1), { danger: true })
    );
  }

  function card(
    path: string,
    tools: HTMLElement,
    ...body: (Node | null)[]
  ): HTMLElement {
    return h(
      'div',
      { class: 'win' },
      h(
        'div',
        { class: 'win-bar' },
        h('span', { class: 'dot' }),
        h('span', { class: 'dot' }),
        h('span', { class: 'dot' }),
        h('span', { class: 'path' }, path),
        tools
      ),
      h('div', { class: 'win-body' }, body)
    );
  }

  let focusNext: string | null = null;
  function addAndFocus(id: string): void {
    focusNext = id;
    render();
    scheduleSave(200);
  }

  // ── Sections ────────────────────────────────────────────────
  function about(): HTMLElement {
    const descId = `in-${newItemId()}`;
    return h(
      'section',
      { class: 'split', 'aria-labelledby': 'about-heading' },
      h(
        'div',
        { class: 'sec-head' },
        h('span', { class: 'eyebrow' }, 'Intro'),
        h(
          'h2',
          { class: 'heading-3', id: 'about-heading' },
          'What people see first'
        ),
        h(
          'p',
          { class: 'muted' },
          'The title and note appear above the form and on the results page.'
        )
      ),
      h(
        'div',
        { class: 'form-stack' },
        textInput(
          'Title',
          content.title,
          LIMITS.title,
          v => (content.title = v),
          {
            placeholder: 'e.g. Friday all-hands',
          }
        ),
        h(
          'div',
          { class: 'field' },
          h(
            'label',
            { class: 'field-label', for: descId },
            'Note to participants'
          ),
          h(
            'textarea',
            {
              class: 'textarea',
              id: descId,
              maxlength: LIMITS.description,
              placeholder:
                'Optional. Say what the poll is for or how long it takes.',
              oninput: (e: Event) => {
                content.description = (e.target as HTMLTextAreaElement).value;
                scheduleSave();
              },
            },
            content.description
          )
        )
      )
    );
  }

  function fieldCard(field: ProfileField, index: number): HTMLElement {
    const choicesId = `in-${newItemId()}`;
    return card(
      `Detail ${index + 1}`,
      itemTools(content.fields, index, 'detail'),
      h(
        'div',
        { class: 'row-2' },
        textInput('Label', field.label, LIMITS.label, v => (field.label = v), {
          placeholder: 'e.g. Full name',
          'data-focus': field.id,
        }),
        typePicker(
          'Answer type',
          field.type,
          FIELD_TYPES,
          FIELD_TYPE_NAMES,
          v => {
            field.type = v;
            if (v === 'select' && !field.options.length)
              field.options = ['', ''];
          }
        )
      ),
      field.type === 'select'
        ? h(
            'div',
            { class: 'field' },
            h(
              'label',
              { class: 'field-label', for: choicesId },
              'Choices, one per line'
            ),
            h(
              'textarea',
              {
                class: 'textarea',
                id: choicesId,
                rows: 4,
                oninput: (e: Event) => {
                  field.options = (e.target as HTMLTextAreaElement).value
                    .split('\n')
                    .slice(0, LIMITS.choices);
                  scheduleSave();
                },
              },
              field.options.join('\n')
            )
          )
        : null,
      requiredToggle(field.required, v => (field.required = v))
    );
  }

  function fieldsSection(): HTMLElement {
    const full = content.fields.length >= LIMITS.fields;
    const addField = (label: string, type: FieldType) => {
      const id = newItemId();
      content.fields.push({ id, label, type, required: true, options: [] });
      addAndFocus(id);
    };
    return h(
      'section',
      { class: 'split', 'aria-labelledby': 'fields-heading' },
      h(
        'div',
        { class: 'sec-head' },
        h(
          'span',
          { class: 'eyebrow' },
          `${content.fields.length} of ${LIMITS.fields}`
        ),
        h(
          'h2',
          { class: 'heading-3', id: 'fields-heading' },
          'Details to collect'
        ),
        h(
          'p',
          { class: 'muted' },
          'Asked once, before the questions. Leave empty to let people answer anonymously.'
        )
      ),
      h(
        'div',
        { class: 'q-list' },
        content.fields.map(fieldCard),
        h(
          'div',
          { class: 'flex flex-wrap gap-2' },
          PRESETS.filter(
            p => !content.fields.some(f => f.label === p.label)
          ).map(p =>
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-quiet',
                disabled: full,
                onclick: () => addField(p.label, p.type),
              },
              `+ ${p.label}`
            )
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-quiet',
              disabled: full,
              onclick: () => addField('', 'text'),
            },
            '+ Custom'
          )
        )
      )
    );
  }

  function choiceRows(question: Question): HTMLElement {
    return h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label' }, 'Choices'),
      question.options.map((option, i) =>
        h(
          'div',
          { class: 'option-row' },
          h('input', {
            class: 'input',
            value: option.label,
            maxlength: LIMITS.choice,
            placeholder: `Choice ${i + 1}`,
            'aria-label': `Choice ${i + 1}`,
            'data-focus': option.id,
            oninput: (e: Event) => {
              option.label = (e.target as HTMLInputElement).value;
              scheduleSave();
            },
          }),
          tool(
            '✕',
            `Remove choice ${i + 1}`,
            () => question.options.splice(i, 1),
            {
              danger: true,
              disabled: question.options.length <= 2,
            }
          )
        )
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-quiet add-row',
          disabled: question.options.length >= LIMITS.choices,
          onclick: () => {
            const id = newItemId();
            question.options.push({ id, label: '' });
            addAndFocus(id);
          },
        },
        '+ Choice'
      )
    );
  }

  function questionCard(question: Question, index: number): HTMLElement {
    return card(
      `Question ${String(index + 1).padStart(2, '0')}`,
      itemTools(content.questions, index, 'question'),
      h(
        'div',
        { class: 'row-2' },
        textInput(
          'Prompt',
          question.prompt,
          LIMITS.label,
          v => (question.prompt = v),
          {
            placeholder: 'e.g. Which session was most useful?',
            'data-focus': question.id,
          }
        ),
        typePicker(
          'Answer type',
          question.type,
          QUESTION_TYPES,
          QUESTION_TYPE_NAMES,
          (v: QuestionType) => {
            question.type = v;
            const choices = v === 'single' || v === 'multiple';
            if (choices && question.options.length < 2) {
              question.options = [
                { id: newItemId(), label: '' },
                { id: newItemId(), label: '' },
              ];
            }
          }
        )
      ),
      question.type === 'single' || question.type === 'multiple'
        ? choiceRows(question)
        : null,
      requiredToggle(question.required, v => (question.required = v))
    );
  }

  function questionsSection(): HTMLElement {
    return h(
      'section',
      { class: 'split', 'aria-labelledby': 'questions-heading' },
      h(
        'div',
        { class: 'sec-head' },
        h(
          'span',
          { class: 'eyebrow' },
          `${content.questions.length} of ${LIMITS.questions}`
        ),
        h('h2', { class: 'heading-3', id: 'questions-heading' }, 'Questions'),
        h(
          'p',
          { class: 'muted' },
          set.submitted > 0
            ? `${set.submitted} people have answered. Renaming choices keeps their votes; removing a choice drops its votes from the results.`
            : 'People see results for every question once they submit.'
        )
      ),
      h(
        'div',
        { class: 'q-list' },
        content.questions.map(questionCard),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-secondary add-row',
            disabled: content.questions.length >= LIMITS.questions,
            onclick: () => {
              const id = newItemId();
              content.questions.push({
                id,
                prompt: '',
                type: 'single',
                required: true,
                options: [
                  { id: newItemId(), label: '' },
                  { id: newItemId(), label: '' },
                ],
              });
              addAndFocus(id);
            },
          },
          '+ Add question'
        )
      )
    );
  }

  function render(): void {
    const scrollY = window.scrollY;
    root.replaceChildren(
      h(
        'div',
        { class: 'flex flex-col gap-16' },
        about(),
        fieldsSection(),
        questionsSection()
      )
    );
    root.removeAttribute('aria-busy');
    if (focusNext) {
      root.querySelector<HTMLElement>(`[data-focus="${focusNext}"]`)?.focus();
      focusNext = null;
    } else {
      window.scrollTo(0, scrollY);
    }
  }

  render();
  showProblems(publishProblems(content));
}

const data = readJson<SetData>('set-data');
const root = document.getElementById('editor');
if (data && root) startEditor(data, root);
