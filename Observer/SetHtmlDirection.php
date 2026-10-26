<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\Locale\ResolverInterface as LocaleResolver;
use Magento\Framework\View\Page\Config as PageConfig;
use OOCS\LynxTheme\Helper\Theme as ThemeHelper;

/**
 * Puts dir="rtl" on <html> when the store view's locale is a right-to-left language and the OOCS/Lynx theme (or a
 */
class SetHtmlDirection implements ObserverInterface
{
    /**
     * Languages written right to left, as the first part of a Magento locale code:
     * the ones core's locale list ships (ar_*, fa_IR, he_IL). A store that adds
     * other locales extends the list with an after plugin on getRtlLanguages().
     */
    private const RTL_LANGUAGES = ['ar', 'fa', 'he'];

    /**
     * The decision for this request
     *
     * @var bool|null
     */
    private ?bool $isRtl = null;

    /**
     * Page config, locale resolver, theme helper
     *
     * @param PageConfig $pageConfig
     * @param LocaleResolver $localeResolver
     * @param ThemeHelper $themeHelper
     */
    public function __construct(
        private readonly PageConfig $pageConfig,
        private readonly LocaleResolver $localeResolver,
        private readonly ThemeHelper $themeHelper,
    ) {
    }

    /**
     * Execute
     *
     * @param Observer $observer
     * @return void
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function execute(Observer $observer): void
    {
        if ($this->isRtl === null) {
            $language = strstr($this->localeResolver->getLocale(), '_', true);
            $this->isRtl = $this->themeHelper->isLynxTheme()
                && \in_array($language, $this->getRtlLanguages(), true);
        }

        if ($this->isRtl) {
            $this->pageConfig->setElementAttribute(PageConfig::ELEMENT_TYPE_HTML, 'dir', 'rtl');
        }
    }

    /**
     * Language codes (ISO 639, the part of the locale before "_") laid out right to left
     *
     * @return string[]
     */
    public function getRtlLanguages(): array
    {
        return self::RTL_LANGUAGES;
    }
}
