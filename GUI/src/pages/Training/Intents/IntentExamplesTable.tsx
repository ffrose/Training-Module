import { FC, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createColumnHelper } from '@tanstack/react-table';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError, HttpStatusCode } from 'axios';
import {
  MdDeleteOutline,
  MdOutlineModeEditOutline,
  MdOutlineSave,
  MdAddCircle,
} from 'react-icons/md';

import { Button, DataTable, Dialog, FormTextarea, Icon } from 'components';
import useDocumentEscapeListener from 'hooks/useDocumentEscapeListener';
import { INTENT_EXAMPLE_LENGTH } from 'constants/config';
import type { Entity } from 'types/entity';
import { turnExampleIntoIntent, deleteExample, editExample } from 'services/intents';
import { useToast } from 'hooks/useToast';
import IntentExamplesEntry from './IntentExamplesEntry';
import { Intent } from '../../../types/intent';
import LoadingDialog from "../../../components/LoadingDialog";
import i18n from '../../../../i18n';

type IntentExamplesTableProps = {
  examples: string[];
  onAddNewExample: (example: string) => void;
  entities: Entity[];
  selectedIntent: Intent;
  queryRefresh: (selectIntent: string) => void;
  updateSelectedIntent: (intent: Intent) => void;
};

const IntentExamplesTable: FC<IntentExamplesTableProps> = ({
  examples,
  onAddNewExample,
  entities,
  selectedIntent,
  queryRefresh,
  updateSelectedIntent
}) => {
  let updatedExampleTitle = '';
  const { t } = useTranslation();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const newExampleRef = useRef<HTMLTextAreaElement>(null);
  const [exampleText, setExampleText] = useState<string>('');
  const [oldExampleText, setOldExampleText] = useState<string>('');
  const [editableRow, setEditableRow] = useState<{
    intentName: string;
    value: string;
  } | null>(null);
  const [deletableRow, setDeletableRow] = useState<{
    intentName: string;
    value: string;
  } | null>(
    null
  );
  const [exampleToIntent, setExampleToIntent] = useState<{
    intentName: string,
    value: string;
  } | null>(null);
  const columnHelper = createColumnHelper<{ id: string; value: string }>();
  const queryClient = useQueryClient();

  const handleRefresh = (selectIntent: string) => {
    queryRefresh(selectIntent);
  };

  useDocumentEscapeListener(() => {
    updatedExampleTitle = '';
    setEditableRow(null);
  });

  const examplesData = useMemo(
      () => examples.map((example, index) => ({ id: index, value: example })),
      [examples]
  );

  const handleEditableRow = (example: { intentName: string; value: string }) => {
    setEditableRow(example);
  };

  const updateExampleOnList = (oldExample: string, newExample: string): void => {
    const updatedIntent = selectedIntent;
    updatedIntent.examples[updatedIntent.examples.indexOf(oldExample)] = newExample;
    updateSelectedIntent(updatedIntent);
  }

  const deleteExampleFromList = (example: string): void => {
    const updatedIntent = selectedIntent;
    const examplesArray = updatedIntent.examples;
    const index = examplesArray.findIndex(item => item === example);
    examplesArray.splice(index, 1);
    updatedIntent.examples = examplesArray;
    updateSelectedIntent(updatedIntent);
  }

  const exampleToIntentMutation = useMutation({
    mutationFn: ({ exampleName }: {intentName: string, exampleName: string} ) =>
      turnExampleIntoIntent({
        intentName: selectedIntent.intent,
        exampleName: exampleName,
      }),
    onSuccess: () => {
      toast.open({
        type: 'success',
        title: t('global.notification'),
        message: t('toast.exampleConvertedtoIntent'),
      });
    },
    onError: (error: AxiosError) => {
      toast.open({
        type: 'error',
        title: t('global.notificationError'),
        message:
          error.response?.status === HttpStatusCode.Conflict
            ? t('training.intents.error.turnExampleIntoIntent')
            : error.message,
      });
    },
    onSettled: () => setExampleToIntent(null),
  });

  const exampleEditMutation = useMutation({
    mutationFn: (addExamplesData: {
      intentName: string,
      oldExample: string,
      newExample: string}) => editExample(addExamplesData),
    onMutate: async () => {
      setRefreshing(true)
      await queryClient.invalidateQueries(['intents/full']);
    },
    onSuccess: () => {
      toast.open({
        type: 'success',
        title: t('global.notification'),
        message: t('toast.newExampleAdded'),
      });
      updateExampleOnList(oldExampleText, exampleText);
    },
    onError: (error: AxiosError) => {
      toast.open({
        type: 'error',
        title: t('global.notificationError'),
        message: error.message,
      });
    },
    onSettled: () => {
      setEditableRow(null);
      setRefreshing(false);
    }
  });

  const exampleDeleteMutation = useMutation({
    mutationFn: (deleteExampleData: { intentName: string, example: string}) => deleteExample(deleteExampleData),
    onMutate: () => setRefreshing(true),
    onSuccess: () => {
      toast.open({
        type: 'success',
        title: t('global.notification'),
        message: t('toast.exampleDeleted'),
      });
      handleRefresh(selectedIntent.intent);
      deleteExampleFromList(oldExampleText);
    },
    onError: (error: AxiosError) => {
      toast.open({
        type: 'error',
        title: t('global.notificationError'),
        message: error.message,
      });
    },
    onSettled: () => {
      setDeletableRow(null);
      setRefreshing(false)
    }
  });

  const handleNewExampleSubmit = () => {
    if (!newExampleRef.current) return;
    onAddNewExample(newExampleRef.current.value || '');
    newExampleRef.current.value = '';
    setExampleText('');
  };

  const updateEditingExampleTitle = (newName: string) => {
    updatedExampleTitle = newName;
  }

  const examplesColumns = useMemo(
    () => [
      columnHelper.accessor('value', {
        header: t('training.intents.examples') || '',
        cell: (props) => buildValueCell(editableRow, updateEditingExampleTitle, entities, props.row.original.id, props.getValue()),
      }),
      columnHelper.display({
        header: '',
        cell: ({
          row: {
            original: { id, value: name },
          },
        }) => buildTurnExampleToIntentCell(() => setExampleToIntent({ intentName: id, value: name})),
        id: 'turnExampleIntoIntent',
        meta: {
          size: '1%',
        },
      }),
      columnHelper.display({
        header: '',
        cell: (props) => buildEditCell(
          editableRow?.intentName === props.row.original.id,
          () => {
            if(!editableRow)
              return;
            setOldExampleText(editableRow.value);
            setExampleText(updatedExampleTitle.trim());
              exampleEditMutation.mutate({
                intentName: selectedIntent.intent,
                oldExample: editableRow.value,
                newExample: updatedExampleTitle.trim(),
              })
          },
          () => handleEditableRow({
            intentName: props.row.original.id,
            value: props.row.original.value
          }),
        ),
        id: 'edit',
        meta: {
          size: '1%',
        },
      }),
      columnHelper.display({
        header: '',
        cell: (props) => buildDeleteCell(() => setDeletableRow({
          intentName: props.row.original.id,
          value: props.row.original.value
        })),
        id: 'delete',
        meta: {
          size: '1%',
        },
      }),
    ],
    [columnHelper, t, editableRow, entities, updateEditingExampleTitle,
          exampleEditMutation, selectedIntent.intent, updatedExampleTitle]
  );

  return (
    <>
      <DataTable
        data={examplesData}
        columns={examplesColumns}
        tableBodyPrefix={
          <tr>
            <td>
              <FormTextarea
                ref={newExampleRef}
                label={t('global.addNew')}
                name="newExample"
                minRows={1}
                placeholder={t('global.addNew') + '...' || ''}
                hideLabel
                maxLength={INTENT_EXAMPLE_LENGTH}
                showMaxLength
                onChange={(e) => setExampleText(e.target.value)}
                disableHeightResize
              />
            </td>
            <td>
              <Button
                appearance="text"
                onClick={handleNewExampleSubmit}
                disabled={exampleText.length === 0}
              >
                <Icon icon={<MdAddCircle color={'rgba(0,0,0,0.54)'} />} />
                {t('global.add')}
              </Button>
            </td>
          </tr>
        }
      />

      {deletableRow !== null && (
        <Dialog
          title={t('training.intents.deleteExample')}
          onClose={() => setDeletableRow(null)}
          footer={
            <>
              <Button
                appearance="secondary"
                onClick={() => setDeletableRow(null)}
              >
                {t('global.no')}
              </Button>
              <Button
                appearance="error"
                onClick={() => {
                    setOldExampleText(deletableRow.value);
                    exampleDeleteMutation.mutate({
                      intentName: selectedIntent.intent,
                      example: deletableRow.value })
                  }
              }
              >
                {t('global.yes')}
              </Button>
            </>
          }
        >
          <p>{t('global.removeValidation')}</p>
        </Dialog>
      )}

      {exampleToIntent !== null && (
        <Dialog
          title={t('training.intents.turnExampleIntoIntent')}
          onClose={() => setExampleToIntent(null)}
          footer={
            <>
              <Button
                appearance="secondary"
                onClick={() => setExampleToIntent(null)}
              >
                {t('global.no')}
              </Button>
              <Button
                appearance="error"
                onClick={() => {
                    exampleToIntentMutation.mutate({
                      intentName: exampleToIntent.intentName,
                      exampleName: exampleToIntent.value
                    })
                  }
                }
              >
                {t('global.yes')}
              </Button>
            </>
          }
        >
          <p>{t('global.removeValidation')}</p>
        </Dialog>
      )}
      {refreshing && (
          <LoadingDialog title={t('global.updatingDataHead')} >
            <p>{t('global.updatingDataBody')}</p>
          </LoadingDialog>
      )}
    </>
  );
};

const buildValueCell = (
  editableRow: { intentName: string; value: string; } | null,
  updateEditingExampleTitle: (newName: string) => void,
  entities: Entity[],
  id: string,
  value: string,
): any => {
  if(editableRow?.intentName === id) {
    return (
      <FormTextarea
        name={`example-${id}`}
        label=""
        defaultValue={editableRow.value}
        hideLabel
        minRows={1}
        maxLength={INTENT_EXAMPLE_LENGTH}
        onChange={(e) => updateEditingExampleTitle(e.target.value)}
        showMaxLength />
    );
  }

  return (
    <IntentExamplesEntry value={value} entities={entities} />
  );
}

const buildTurnExampleToIntentCell = (onClick: () => void) => {
  return (
    <Button
      appearance="text"
      onClick={onClick}
    >
      <Icon
        label={i18n.t('training.intents.turnExampleIntoIntent')}
        icon={<MdOutlineModeEditOutline color={'rgba(0,0,0,0.54)'} />}
      />
      {i18n.t('training.intents.turnExampleIntoIntent')}
    </Button>
  )
}

const buildEditCell = (
  isSave: boolean,
  onSaveClick: () => void,
  onEditClick: () => void,
) => {
  if(isSave) {
    return (
      <Button
        appearance="text"
        onClick={onSaveClick}
      >
        <Icon
          label={i18n.t('global.save')}
          icon={<MdOutlineSave color={'rgba(0,0,0,0.54)'} />}
        />
        {i18n.t('global.save')}
      </Button>
    )
  }

  return (
    <Button
      appearance="text"
      onClick={onEditClick}
    >
      <Icon
        label={i18n.t('global.edit')}
        icon={<MdOutlineModeEditOutline color={'rgba(0,0,0,0.54)'} />}
      />
      {i18n.t('global.edit')}
    </Button>    
  )
}

const buildDeleteCell = (onClick: () => void) => {
  return (
    <Button
      appearance="text"
      onClick={onClick}
    >
      <Icon
        label={i18n.t('global.delete')}
        icon={<MdDeleteOutline color={'rgba(0,0,0,0.54)'} />}
      />
      {i18n.t('global.delete')}
    </Button>
  )
}

export default IntentExamplesTable;
