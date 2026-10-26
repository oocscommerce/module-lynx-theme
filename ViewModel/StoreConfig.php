<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\ViewModel;

use Magento\Customer\CustomerData\SectionPool;
use Magento\Framework\App\Cache\Type\Config as ConfigCache;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Locale\FormatInterface as LocaleFormat;
use Magento\Framework\Serialize\SerializerInterface;
use Magento\Framework\Session\Config\ConfigInterface as SessionConfig;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Framework\View\Element\Js\Cookie as CookieConfigBlock;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManagerInterface;

/**
 * The store-scope configuration the client bundle needs on every page, rendered as lynxStoreConfig
 */
class StoreConfig implements ArgumentInterface
{
    /**
     * Tag on the cached payload, next to the one the cache type adds itself.
     * Cleaning `config` drops it; this is here so it can also be dropped on its
     * own, without emptying the configuration cache with it.
     */
    public const CACHE_TAG = 'LYNX_STORE_CONFIG';

    private const XML_PATH_SECTION_LIFETIME = 'customer/online_customers/section_data_lifetime';

    /**
     * Payloads already answered in this request, by cache key
     *
     * @var array<string, array<string, mixed>>
     */
    private array $resolved = [];

    /**
     * Store manager, scope config, url, request, locale format, serializer, session config, cookie config, cache
     *
     * @param StoreManagerInterface $storeManager
     * @param ScopeConfigInterface $scopeConfig
     * @param UrlInterface $url
     * @param RequestInterface $request
     * @param LocaleFormat $localeFormat
     * @param SerializerInterface $serializer
     * @param SessionConfig $sessionConfig
     * @param CookieConfigBlock $cookieConfig
     * @param ConfigCache $cache
     * @param SectionPool $sectionPool
     * @param string[] $pageComponents
     * @SuppressWarnings(PHPMD.ExcessiveParameterList)
     */
    public function __construct(
        private readonly StoreManagerInterface $storeManager,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly UrlInterface $url,
        private readonly RequestInterface $request,
        private readonly LocaleFormat $localeFormat,
        private readonly SerializerInterface $serializer,
        private readonly SessionConfig $sessionConfig,
        private readonly CookieConfigBlock $cookieConfig,
        private readonly ConfigCache $cache,
        private readonly SectionPool $sectionPool,
        // Registry paths Pages/Default mounts on every page; conditional ones go through a plugin on build()
        private readonly array $pageComponents = [],
    ) {
    }

    /**
     * Get Config
     *
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        // Read here rather than held on a property: a property would outlive store emulation
        $store = $this->storeManager->getStore();
        $key = $this->cacheKey($store);

        if (isset($this->resolved[$key])) {
            return $this->resolved[$key];
        }

        $cached = $this->cache->load($key);
        if ($cached !== false) {
            return $this->resolved[$key] = (array) $this->serializer->unserialize($cached);
        }

        $config = $this->build($store);
        $this->cache->save($this->serializer->serialize($config), $key, [self::CACHE_TAG]);

        return $this->resolved[$key] = $config;
    }

    /**
     * Everything the payload below is built out of, and nothing else
     *
     * @param StoreInterface $store
     * @return string
     */
    private function cacheKey(StoreInterface $store): string
    {
        return implode('_', [
            'LYNX_STORE_CONFIG',
            (string) $store->getId(),
            (string) $store->getCurrentCurrency()->getCode(),
            (int) $this->request->isSecure(),
        ]);
    }

    /**
     * Build
     *
     * @param StoreInterface $store
     * @return array<string, mixed>
     */
    public function build(StoreInterface $store): array
    {
        return [
            // Scopes anything the client asks the server for outside a normal page request
            'storeCode' => $store->getCode(),
            // The currency being browsed
            'currencyCode' => $store->getCurrentCurrency()->getCode(),
            // "Add Store Code to URLs"
            'storeInUrl' => $store->isUseStoreInUrl(),
            'baseUrl' => $store->getBaseUrl(),
            'sections' => [
                // Built like core's Customer\Block\CustomerData::getCustomerDataUrl()
                'url'        => $this->url->getUrl(
                    'customer/section/load',
                    ['_secure' => $this->request->isSecure()]
                ),
                // "Customer Data Lifetime" admin config (minutes) → seconds, for the client-side staleness check
                'lifetime'   => $this->getSectionDataLifetime(),
                // Every section the server CAN serve
                'serverSide' => $this->sectionPool->getSectionNames(),
            ],
            // Same payload Luma exposes as checkoutConfig.priceFormat
            'priceFormat' => $this->localeFormat->getPriceFormat(),
            // See the constructor argument.
            'pageComponents' => array_values($this->pageComponents),
            // Strings of components that are not layout nodes and so have no provider to translate them
            'labels' => [
                'dismissMessage' => (string) __('Close'),
                'dismissAllMessages' => (string) __('Clear All'),
                'skipToContent' => (string) __('Skip to Content'),
                'genericError' => (string) __('Something went wrong. Please try again.'),
            ],
            // Stores > Configuration > General > Web > Default Cookie Settings, for anything the client writes itself
            'cookie' => [
                'path'     => $this->cookieConfig->getPath() ?: '/',
                'domain'   => (string) $this->cookieConfig->getDomain(),
                'lifetime' => (int) $this->cookieConfig->getLifetime(),
                // Not exposed by core's block; both come straight from the same config.
                'secure'   => (bool) $this->sessionConfig->getCookieSecure(),
                'samesite' => $this->sessionConfig->getCookieSameSite() ?: 'Lax',
            ],
        ];
    }

    /**
     * The payload as it goes into the inline script
     *
     * @return string
     */
    public function getConfigJson(): string
    {
        return $this->serializer->serialize($this->getConfig());
    }

    /**
     * Get Section Data Lifetime
     *
     * @return int
     */
    private function getSectionDataLifetime(): int
    {
        $minutes = (int) $this->scopeConfig->getValue(
            self::XML_PATH_SECTION_LIFETIME,
            ScopeInterface::SCOPE_STORE
        );

        return ($minutes ?: 60) * 60;
    }
}
