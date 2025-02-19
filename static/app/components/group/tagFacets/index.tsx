import {Fragment, ReactNode, useEffect, useState} from 'react';
import styled from '@emotion/styled';
import keyBy from 'lodash/keyBy';

import {Button} from 'sentry/components/button';
import Placeholder from 'sentry/components/placeholder';
import * as SidebarSection from 'sentry/components/sidebarSection';
import {t} from 'sentry/locale';
import space from 'sentry/styles/space';
import {Environment, Event, Organization, Project, TagWithTopValues} from 'sentry/types';
import trackAdvancedAnalyticsEvent from 'sentry/utils/analytics/trackAdvancedAnalyticsEvent';
import {formatVersion} from 'sentry/utils/formatters';
import {isMobilePlatform} from 'sentry/utils/platform';
import useApi from 'sentry/utils/useApi';
import useOrganization from 'sentry/utils/useOrganization';

import TagFacetsDistributionMeter from './tagFacetsDistributionMeter';

export const MOBILE_TAGS = ['device', 'os', 'release', 'environment', 'transaction'];

export const FRONTEND_TAGS = ['browser', 'transaction', 'release', 'url', 'environment'];

export const BACKEND_TAGS = [
  'transaction',
  'url',
  'user',
  'release',
  'organization.slug',
];

export const DEFAULT_TAGS = ['transaction', 'environment', 'release'];

export function TAGS_FORMATTER(tagsData: Record<string, TagWithTopValues>) {
  // For "release" tag keys, format the release tag value to be more readable (ie removing version prefix)
  const transformedTagsData = {};
  Object.keys(tagsData).forEach(tagKey => {
    if (tagKey === 'release') {
      transformedTagsData[tagKey] = {
        ...tagsData[tagKey],
        topValues: tagsData[tagKey].topValues.map(topValue => {
          return {
            ...topValue,
            name: formatVersion(topValue.name),
          };
        }),
      };
    } else if (tagKey === 'device') {
      transformedTagsData[tagKey] = {
        ...tagsData[tagKey],
        topValues: tagsData[tagKey].topValues.map(topValue => {
          return {
            ...topValue,
            name: topValue.readable ?? topValue.name,
          };
        }),
      };
    } else {
      transformedTagsData[tagKey] = tagsData[tagKey];
    }
  });
  return transformedTagsData;
}

type Props = {
  environments: Environment[];
  groupId: string;
  project: Project;
  tagKeys: string[];
  event?: Event;
  tagFormatter?: (
    tagsData: Record<string, TagWithTopValues>
  ) => Record<string, TagWithTopValues>;
  title?: ReactNode;
};

type State = {
  loading: boolean;
  tagsData: Record<string, TagWithTopValues>;
};

const LIMIT = 4;

export default function TagFacets({
  tagKeys,
  environments,
  groupId,
  title,
  tagFormatter,
  project,
}: Props) {
  const [state, setState] = useState<State>({
    tagsData: {},
    loading: true,
  });
  const organization = useOrganization();
  const api = useApi();

  useEffect(() => {
    const fetchData = async () => {
      // Fetch the top values for the current group's top tags.
      const data = await api.requestPromise(`/issues/${groupId}/tags/`, {
        query: {
          environment: environments.map(env => env.name),
          readable: true,
          limit: LIMIT,
        },
      });
      const tagsData = keyBy(data, 'key');
      setState({
        ...state,
        tagsData,
        loading: false,
      });
    };
    setState({...state, loading: true});
    fetchData().catch(() => {
      setState({...state, tagsData: {}, loading: false});
    });
    // Don't want to requery everytime state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, JSON.stringify(environments), groupId, tagKeys]);

  const tagsData = tagFormatter?.(state.tagsData) ?? state.tagsData;
  const topTagKeys = tagKeys.filter(tagKey => Object.keys(tagsData).includes(tagKey));
  const remainingTagKeys = Object.keys(tagsData)
    .filter(tagKey => !tagKeys.includes(tagKey))
    .sort();

  return (
    <SidebarSection.Wrap>
      {state.loading || !tagsData ? (
        <TagPlaceholders>
          <Placeholder height="40px" />
          <Placeholder height="40px" />
          <Placeholder height="40px" />
          <Placeholder height="40px" />
        </TagPlaceholders>
      ) : (
        <Fragment>
          <SidebarSection.Title>{title || t('Tag Summary')}</SidebarSection.Title>
          <Content>
            <Fragment>
              <TopDistributionWrapper data-test-id="top-distribution-wrapper">
                <TagFacetsDistributionMeterWrapper
                  groupId={groupId}
                  organization={organization}
                  project={project}
                  tagKeys={topTagKeys}
                  tagsData={tagsData}
                  expandFirstTag
                />
              </TopDistributionWrapper>
              <TagFacetsDistributionMeterWrapper
                groupId={groupId}
                organization={organization}
                project={project}
                tagKeys={remainingTagKeys}
                tagsData={tagsData}
              />
              <ShowAllButtonContainer>
                <Button
                  size="xs"
                  to={getTagUrl(organization.slug, groupId)}
                  onClick={() => {
                    trackAdvancedAnalyticsEvent(
                      'issue_group_details.tags.show_all_tags.clicked',
                      {
                        platform: project?.platform,
                        is_mobile: isMobilePlatform(project?.platform),
                        organization,
                      }
                    );
                  }}
                >
                  {t('View All Tags')}
                </Button>
              </ShowAllButtonContainer>
            </Fragment>
          </Content>
        </Fragment>
      )}
    </SidebarSection.Wrap>
  );
}

function TagFacetsDistributionMeterWrapper({
  groupId,
  organization,
  project,
  tagKeys,
  tagsData,
  expandFirstTag,
}: {
  groupId: string;
  organization: Organization;
  project: Project;
  tagKeys: string[];
  tagsData: Record<string, TagWithTopValues>;
  expandFirstTag?: boolean;
}) {
  return (
    <Fragment>
      {tagKeys.map((tagKey, index) => {
        const tagWithTopValues = tagsData[tagKey];
        const topValues = tagWithTopValues ? tagWithTopValues.topValues : [];
        const topValuesTotal = tagWithTopValues ? tagWithTopValues.totalValues : 0;

        const url = `/organizations/${organization.slug}/issues/${groupId}/tags/${tagKey}/?referrer=tag-distribution-meter`;

        const segments = topValues
          ? topValues.map(value => ({
              ...value,
              url,
            }))
          : [];

        return (
          <TagFacetsDistributionMeter
            key={tagKey}
            title={tagKey}
            totalValues={topValuesTotal}
            segments={segments}
            onTagClick={() => undefined}
            project={project}
            expandByDefault={expandFirstTag && index === 0}
          />
        );
      })}
    </Fragment>
  );
}

function getTagUrl(orgSlug: string, groupId: string) {
  return `/organizations/${orgSlug}/issues/${groupId}/tags/`;
}

const TagPlaceholders = styled('div')`
  display: grid;
  gap: ${space(1)};
  grid-auto-flow: row;
`;

const ShowAllButtonContainer = styled('div')`
  margin-top: ${space(3)};
`;

const Content = styled('div')`
  margin-top: ${space(2)};
`;

const TopDistributionWrapper = styled('div')`
  margin-bottom: 60px;
`;
