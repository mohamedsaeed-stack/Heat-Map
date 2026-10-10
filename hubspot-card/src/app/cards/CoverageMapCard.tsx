// "Coverage map" card on the company record. One button: open this company's
// pin on the FlapKap UAE coverage map. The map reads ?company=<hubspot id>
// (scripts/build-standalone-uae.js, deepLink) and flies to the pin, or says
// why the company is not on it.
import {
  Button,
  CrmContext,
  Flex,
  Text,
  hubspot,
} from '@hubspot/ui-extensions';

const MAP_URL = 'https://coverage-map-production.up.railway.app/';

hubspot.extend<'crm.record.sidebar'>(({ context }) => (
  <CoverageMapCard context={context} />
));

const CoverageMapCard = ({ context }: { context: CrmContext }) => {
  const id = String(context.crm.objectId);
  const url = MAP_URL + '?company=' + encodeURIComponent(id);
  return (
    <Flex direction="column" gap="small">
      <Text variant="microcopy">
        Opens this company's pin on the FlapKap UAE coverage map. The map says
        how exact the pin is, or why the company is not on it.
      </Text>
      <Button href={{ url, external: true }} variant="primary">
        Open on map
      </Button>
    </Flex>
  );
};
